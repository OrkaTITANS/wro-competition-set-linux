#!/usr/bin/env node
const util = require('util');
const Bridge = require('tcpi2c_bridge');
const debug = util.debuglog('tcpi2c');

const devices = require('i2c_devices');
module.exports.devices = devices;

class StringNotFoundError extends Error {}
module.exports.StringNotFoundError = StringNotFoundError;

function get_device(string) {
	for (let i=0; i<devices.length; i++) {
		const device = devices[i];
		if (device.name && device.name === string) return device;
		if (device.aliases && device.aliases.includes(string)) return device;
	}

	throw new StringNotFoundError("No such device: "+string)
}
module.exports.get_device = get_device;

function get_register(device, string) {
	for (let i=0; i<device.registers.length; i++) {
		const register = device.registers[i];
		if (register.name && register.name === string) return register;
		if (register.aliases && register.aliases.includes(string)) return register;
	}

	throw new StringNotFoundError("No such register for device "+device.name+": "+string)
}
module.exports.get_register = get_register;

class DataNotSuppliedError extends Error {}
module.exports.DataNotSuppliedError = DataNotSuppliedError;

function get_function(device, register) {
	return async function(){
		const bridge = new Bridge(() => {
			// +3 is for address, writeBytes, command and readBytes
			const buffer = Buffer.allocUnsafe(register.write+4);

			let i = 0;
			buffer.writeUInt8(device.address, i++);
			buffer.writeUInt8(register.write+1, i++); // +1 is for command
			buffer.writeUInt8(register.command, i++);
			if (register.write) {
				const argument = arguments[0];
				if (register.signed) buffer.writeIntLE(argument, i, register.write);
				else buffer.writeUIntLE(argument, i, register.write);
				i += register.write;
			}
			buffer.writeUInt8(register.read, i++);
			console.assert(i === buffer.length);
			debug("Sending: %O", buffer);
			bridge.end(buffer);
		});
		return new Promise((accept, reject) => {
			const buffer = Buffer.allocUnsafe(register.read);

			let i = 0;
			bridge.on('data', data => {
				debug("Receiving: %O", data);
				let bytesRead;
				data.copy(buffer, i, 0, bytesRead = Math.min(register.read-i, i+data.length));
				i += bytesRead;
				if (i >= register.read) {
					if (register.signed) accept(buffer.readIntLE(0, register.read));
					else accept(buffer.readUIntLE(0, register.read));
				}
			});
			bridge.on('error', reject);
			bridge.on('close', () => {
				if (i < register.read) {
					reject(new DataNotSuppliedError("The remote end closed connection before all data arrive"));
				}
			});
		});
	}
}
module.exports.get_function = get_function;

const apiDataSymbol = Symbol('apiData');
module.exports.apiDataSymbol = apiDataSymbol;

const api = {};
Object.defineProperty(api, apiDataSymbol, {
	configurable: false,
	enumerable: false,
	writable: false,
	value: devices,
});
devices.forEach(device => {
	const deviceApi = {};
	Object.defineProperty(deviceApi, apiDataSymbol, {
		configurable: false,
		enumerable: false,
		writable: false,
		value: device,
	});
	device.registers.forEach(register => {
		const registerApi = get_function(device, register);
		Object.defineProperty(registerApi, apiDataSymbol, {
			configurable: false,
			enumerable: false,
			writable: false,
			value: register,
		});
		Object.defineProperty(deviceApi, register.name, {
			configurable: false,
			enumerable: true,
			writable: false,
			value: registerApi,
		});
		if (register.aliases) register.aliases.forEach(alias => Object.defineProperty(deviceApi, alias, {
			configurable: false,
			enumerable: false,
			writable: false,
			value: registerApi,
		}));
	});
	Object.defineProperty(api, device.name, {
		configurable: false,
		enumerable: true,
		writable: false,
		value: deviceApi,
	});
	if (device.aliases) device.aliases.forEach(alias => Object.defineProperty(api, alias, {
		configurable: false,
		enumerable: false,
		writable: false,
		value: deviceApi,
	}));
});
module.exports.api = api;

if (require.main === module) {
	const repl = require('repl');
	const r = repl.start({prompt: '> '});
	for (key in module.exports) {
		Object.defineProperty(r.context, key, {
			configurable: false,
			enumerable: true,
			writable: false,
			value: module.exports[key],
		});
	};
	r.defineCommand('test', {
		help: "Get Encoder1 position to test whether everything works",
		action: function() {
			api.motor.Encoder1_Count()
				.then(console.log, console.error)
				.then(() => this.displayPrompt())
		},
	});
	r.defineCommand('enccount', {
		help: "Continously dump encoder position until fail",
		action: function() {
			function reccall() {
				api.motor.Encoder1_Count()
					.then(data => {
						process.stdout.write(util.format("\033[K%O\r", data));
						reccall(...arguments);
					}, error => {
						console.error(error);
						r.displayPrompt();
					});
			}

			reccall();
		},
	});
}
