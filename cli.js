#!/usr/bin/env node
const util = require("util");
// noinspection NpmUsedModulesInstalled
const {api} = require('tcpi2c');

if (!process.stdin.isTTY) {
    console.warn("STDIN is not a tty");
} else {
    process.stdin.setRawMode(true);
}

let lm1t = 0;
let lm2t = 0;
let step = 300;
let speed = 100;
let stepMode = true;

// noinspection JSUnresolvedFunction
process.stdin.setEncoding('ascii');
process.stdin.on('data', chunk => {
    //console.debug("Got chunk: %o", chunk);
    for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        process.stderr.write(util.format("%s\n", c));
        (() => {
            switch (c) {
                case '\n':
                case '\r':
                    return Promise.resolve();
                case 'w':
                    if (stepMode) {
                        return api.motor.Motor_Degrees(speed, lm1t += step, speed, lm2t += step);
                    } else {
                        return api.motor.Motor_Speeds(speed, speed);
                    }
                case 'a':
                    if (stepMode) {
                        return api.motor.Motor1_Degree(speed, lm1t += step);
                    } else {
                        return api.motor.Motor_Speeds(speed, 0);
                    }
                case 's':
                    if (stepMode) {
                        return api.motor.Motor_Degrees(speed, lm1t -= step, speed, lm2t -= step);
                    } else {
                        return api.motor.Motor_Speeds(-speed, -speed);
                    }
                case 'd':
                    if (stepMode) {
                        return api.motor.Motor2_Degree(speed, lm2t += step);
                    } else {
                        return api.motor.Motor_Speeds(0, speed);
                    }
                case ' ':
                    return api.motor.Motor_Powers(0, 0);
                case '?':
                    return Promise.all([
                        api.motor.Encoder1_Degrees(),
                        api.motor.Encoder2_Degrees(),
                    ]);
                case 'm':
                    return api.motor.Reset_Encoders()
                        .then(() => lm1t = lm2t = 0)
                        .then(() => api.motor.Motor_Degrees(30, lm1t, 30, lm2t))
                        .then(() => (stepMode = !stepMode) ? 'step' : 'continuous');
                case '-':
                    return Promise.resolve(speed /= 2);
                case '+':
                    return Promise.resolve(speed *= 2);
                case '<':
                    return Promise.resolve(step /= 2);
                case '>':
                    return Promise.resolve(step *= 2);
                case '=':
                    return api.motor.Motor_Degrees(speed, lm1t, speed, lm2t);
                case 'q':
                case '\x03': // ^C
                case '\x04': // ^D
                case 'x':
                    return api.motor.Controller_Reset()
                        .then(process.exit);
                case '\x11': // ^Q
                    return Promise.resolve(process.exit());
                case 'h':
                    return Promise.resolve("" +
                        "Valid keys:\n" +
                        "   wasd for movement,\n" +
                        "   m for switching mode (steps or continuous),\n" +
                        "   [space] for stop,\n" +
                        "   -+ for changing speed (DPS),\n" +
                        "   <> for changing step (degrees),\n" +
                        "   = recentering wheels,\n" +
                        "   h for help,\n" +
                        "   ? for dump current degrees,\n" +
                        "   q^c^dx for exit and cleanup" +
                        "   and ^q for force quit");
                default:
                    return Promise.reject(
                        new Error(util.format("Unhandled command: %O. Type %O for help.", c, 'h')));
            }
        })().then(data => {
            if (typeof data === "number" || data instanceof Number) {
                process.stdout.write(util.format("%d\n", data));
            } else if (typeof data === "string" || data instanceof String) {
                process.stdout.write(util.format("%s\n", data));
            } else if (data === undefined) {
                //noop
            } else {
                process.stdout.write(util.format("%O\n", data));
            }
            process.stderr.write('> ')
        }, error => {
            process.stdout.write("\r");
            process.stderr.write(util.format("%o\n", error));
            process.stderr.write('> ')
        });
    }
});

(async () => {
    try {
        await api.motor.Controller_Reset();
        await api.motor.Controller_Enable();
        await api.motor.Motor2_Invert(true);
        await api.motor.Motor_Targets(30, lm1t, 30, lm2t);
        process.stderr.write('> ');
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();