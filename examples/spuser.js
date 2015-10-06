"use strict";
var readline = require('readline');
var spread = require('spread-toolkit');

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

var mbox = spread.connect("localhost", "4803", "user", 0, 0);
/*     port: 4803,
     host: "localhost",
     user: "user",
     groups: ["wert"]
});*/

function prompt() {
    rl.question("User>", processCommand);
}

function enterMessage(groups) {
    rl.question("enter message: ", sendMessage(groups));
}

function sendMessage(groups) {
    return function(message) {
	mbox.multicast(spread.SAFE_MESS, groups, 0, message);
	prompt();
    }
}

function processCommand(c) {
    var command = c.split(/\s/);
    switch (command[0]) {
    case 'j':
	mbox.join(command[1]);
	prompt();
	break;
    case 'l':
	mbox.leave(command[1]);
	prompt();
	break;
    case 's':
	command.shift();
	enterMessage(command);
	break;
    case 'm':
	break;
    case 'b':
	break;
    case 'r':
	break;
    case 'p':
	break;
    case 'e':
	break;
    case 'd':
	break;
    case 'q':
	console.log('Bye.');
	rl.close();
	process.exit();
	break;
    default:
	console.log('Unknown commnad');
	console.log('');
	printHelpText();
	prompt();
	break;
    }
}

function printHelpText () {
    console.log('==========');
    console.log('User Menu:');
    console.log('----------');
    console.log('');
    console.log('        j <group> -- join a group');
    console.log('        l <group> -- leave a group');
    console.log('');
    console.log('        s <group> -- send a message');
//    console.log('        m <group> -- send a multiline message to group. Terminate with empty line');
//    console.log('        b <group> -- send a burst of messages');
    console.log('');
    console.log('        q -- quit');
    console.log('');
}

mbox.on('receive', function(serviceType, sender, groups, type, endianMismatch, data) {
    console.log("\nMessage received", serviceType, sender, groups, type, data);
});

prompt();
