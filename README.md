Spread For Node
===============

Javascript bindings for The Spread Toolkit


Usage
-----

```javascript
var spread = require("spread-for-node");

//Connecting to a Spread daemon is pretty simple
var mbox = spread.connect("localhost", 4803 ,"testuser",0,0);

//Wait until a connection is established.
mbox.on("connect", function(){
	
	//So is joining a channel
	mbox.join("channel");

	//lets send a simple message
	mbox.multicast(spread.SAFE_MESS, ['channel'], 0, new Buffer([1,2,3,4,5]));
});

//Listen for recieved messages
mbox.on("receive", function(serviceType, sender, groups, type, endianMismatch, data){
	//Do things with the recieved messages
})
```