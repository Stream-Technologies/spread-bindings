"use strict";
var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

/*
    Function: bigEndian
    Check if the int is a big endian
*/
var bigEndian = function(i) {
    return (i & 0x80000080) === 0;
}

var clearEndian = function(i) {
    return (i & ~0x80000080);
}

// The default Spread port.
var DEFAULT_SPREAD_PORT = 4803;
	
// The maximum length of the private name.
var MAX_PRIVATE_NAME = 10;
	
// The maximum length of a message + group names.
var MAX_MESSAGE_LENGTH = 140000;

// The maximum length of the group name.
var MAX_GROUP_NAME = 32;
	
// The Spread version.
var SP_MAJOR_VERSION = 4;
var SP_MINOR_VERSION = 4;
var SP_PATCH_VERSION = 0;

// The default authentication method
var DEFAULT_AUTH_NAME = "NULL";

// The class name of the default authentication method
var DEFAULT_AUTHCLASS_NAME = "spread.NULLAuth";

// The maximum length of a authentication method name
var MAX_AUTH_NAME = 30;

// The maximum number of authentication methods
var MAX_AUTH_METHODS = 3;

// Received if a connection attempt was successful.
var ACCEPT_SESSION = 1;
	
// Used to determine endianness.
var ENDIAN_TYPE = 0x80000080;

var SpreadException = function(message) {
    this.message = message;
};

var STATE_CONNECT_SENT = 1;
var STATE_AUTH_METHOD_SENT = 2;
var STATE_CONNECTED = 3;

var Connection = function() {
    this.buffer = new Buffer(0);
    this.authName = DEFAULT_AUTH_NAME;
    EventEmitter.call(this);
};

util.inherits(Connection, EventEmitter);

Connection.UNRELIABLE_MESS        = 1;
Connection.RELIABLE_MESS          = 2;
Connection.FIFO_MESS              = 4;
Connection.CAUSAL_MESS            = 8;
Connection.AGREED_MESS            = 16;
Connection.SAFE_MESS              = 32;
Connection.REGULAR_MESS           = 63;
Connection.SELF_DISCARD           = 64;
Connection.REG_MEMB_MESS          = 4096;
Connection.TRANSITION_MESS        = 8192;
Connection.CAUSED_BY_JOIN         = 256;
Connection.CAUSED_BY_LEAVE        = 512;
Connection.CAUSED_BY_DISCONNECT   = 1024;
Connection.CAUSED_BY_NETWORK      = 2048;
Connection.MEMBERSHIP_MESS        = 16128;

Connection.REJECT_MESS            = 4194304;

// Service-types used only within the package.
Connection.JOIN_MESS              = 65536;
Connection.LEAVE_MESS             = 131072;
Connection.KILL_MESS              = 262144;
Connection.GROUPS_MESS            = 524288;

Connection.prototype._connect = function() {
    // Send the connect message.

    // Check the private name for validity.
    var len = (this.privateName == null ? 0 : this.privateName.length);
    if(len > MAX_PRIVATE_NAME) {
	this.privateName = this.privateName.substring(0, MAX_PRIVATE_NAME);
	len = MAX_PRIVATE_NAME;
    }
    
    // Allocate the buffer.
    var buffer = new Buffer(len + 5);
    
    // Set the version.
    buffer[0] = SP_MAJOR_VERSION;
    buffer[1] = SP_MINOR_VERSION;
    buffer[2] = SP_PATCH_VERSION;

    // Byte used for group membership and priority.
    buffer[3] = 0; // TODO: The c verison sets this to 1, I don't know if this is needed or even important.
    
    // Group membership.
    if(this.groupMembership)
    {
	buffer[3] |= 0x01;
    }
    
    // Priority.
    if(this.priority)
    {
	buffer[3] |= 0x10;
    }
    
    // Write the length.
    buffer[4] = len;
    
    if(len > 0) {
	buffer.write(this.privateName, 5, len, 'ascii')
    }
    
    // Send the connection message.
    this.socket.write(buffer);

    this.state = STATE_CONNECT_SENT;
    
};

Connection.prototype.readUChar = function() {
    if ( this.buffer.length - this.offset - 1 < 0 ) {
	return null;
    }
    var n = this.buffer.readUInt8(this.offset);
    this.offset ++;
    return n;
}

Connection.prototype.readIntAndDetectEndian = function() {
    if ( this.buffer.length - this.offset - 4 < 0 ) {
	return null;
    }
    var littleEndian = false;
    var n = this.buffer.readInt32BE(this.offset);
    if (! bigEndian(n) ) {
	n = this.buffer.readInt32LE(this.offset);
	littleEndian = true;
    }
    this.offset += 4;
    return [n, littleEndian];
};

Connection.prototype.readInt = function() {
    var values = this.readIntAndDetectEndian();
    if ( values === null ) {
	return null;
    }
    if ( values[1] ) {
	// The server is Little Endian.
	this.readInt = Connection.prototype.readIntLE;
    } else {
	// The server is Big Endian.
	this.readInt = Connection.prototype.readIntBE;
    }
    return values[0];
};

Connection.prototype.readIntBE = function() {
    if ( this.buffer.length - this.offset - 4 < 0 ) {
	return null;
    }
    var n = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return n;
};

Connection.prototype.readIntLE = function() {
    if ( this.buffer.length - this.offset - 4 < 0 ) {
	return null;
    }
    var n = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return n;
}

Connection.prototype.readString = function(n) {
    if (this.buffer.length - this.offset - n < 0 ) {
	return null;
    }
    var str = this.buffer.toString('ascii', this.offset, this.offset + n);
    this.offset += n;
    return str;
};

Connection.prototype.ignoreBytes = function(n) {
    if ( this.buffer.length - this.offset - n < 0 ) {
	return false;
    }
    this.offset += n;
    return true;
};

Connection.prototype.copyBytes = function(n) {
    if ( this.buffer.length - this.offset - n < 0 ) {
	return null;
    }
    var bytes = this.buffer.slice(this.offset, this.offset + n);
    this.offset += n;
    return bytes;
}

Connection.prototype.readAuthMethods = function() {
    // Read the length.
    var len = this.readUChar();

    if (len === null) {
	return false;
    }
    
    // Check if it was a response code
    if( len >= 128 )
    {
	throw new SpreadException("Connection attempt rejected=" + (0xffffff00 | len));
    }

    // Read the name.
    // for now we ignore the list.
    return this.ignoreBytes(len)
}

// Sends the choice of auth methods  message.
Connection.prototype.sendAuthMethod = function()	{
    var len = this.authName.length;
    
    // Allocate the buffer.
     var buffer = new Buffer( MAX_AUTH_NAME * MAX_AUTH_METHODS );

    buffer.write(this.authName,0, this.authName.length, 'ascii'); // Todo is this meant to be Latin 1?
    
    for( ; len < ( MAX_AUTH_NAME * MAX_AUTH_METHODS ) ; len++ )
	buffer[len] = 0;

    // Send the connection message.
    this.socket.write(buffer);
}

// Checks for an accept message.
Connection.prototype.checkAccept = function() {
    // Read the connection response.
    var accepted = this.readUChar();
    if ( accepted === null ) {
	return false;
    }

    // Was it accepted?
    if(accepted != ACCEPT_SESSION)
    {
	// Todo I think I need another way of passing errors back to the client.
	throw new SpreadException("Connection attempt rejected=" + (0xffffff00 | accepted));
    }
    return true;
}
	
// Checks the daemon version.
Connection.prototype.checkVersion = function() {		
    // Read the version.
    var majorVersion = this.readUChar();
    if ( majorVersion === null ) {
	return false;
    }
    
    // Read the sub-version.
    var  minorVersion = this.readUChar();
    if ( minorVersion === null ) {
	return false;
    }
        
    // Read the patch-version.
    var patchVersion = this.readUChar();
    if ( patchVersion === null ) {
	return false;
    }
    
    // Check the version.
    var version = ( (majorVersion*10000) + (minorVersion*100) + patchVersion );
    if(version < 30100)
    {
	throw new SpreadException("Old version " + majorVersion + "." + minorVersion + "." + patchVersion + " not supported");
    }
    if((version < 30800) && (priority))
    {
	throw new SpreadException("Old version " + majorVersion + "." + minorVersion + "." + patchVersion + " does not support priority");
    }
    
    return true;
}
	
// Get the private group name.
Connection.prototype.readGroup = function() {
    // Read the length.
    var len = this.readUChar();
    if ( len === null ) {
	return false;
    }

    // Read the private group name.
    this.group = this.readString(len);

    return  this.group !== null;
}

// Actually receives a new message
Connection.prototype. internal_receive = function() {
    
    // Read the header.
    
    // Get service type.
    var serviceType = this.readInt();
    if ( serviceType === null ) {
	return false;
    }

    // Get the sender.
    var sender = this.readString( MAX_GROUP_NAME );
    if ( sender === null ) {
	return false;
    }

    // Get the number of groups.
    var numGroups = this.readInt();
    if ( numGroups === null ) {
	return false;
    }

    // Get the hint/type.
    var hint = this.readIntAndDetectEndian();
    if ( hint === null ) {
	return false;
    }
    var littleEndian = hint[1];
    hint = hint[0];

    // Get the data length.
    var dataLen = this.readInt();
        
    // Validate numGroups and dataLen

    if ( (numGroups < 0) || (dataLen < 0) ) 
    {
	// drop message
	// Todo, error handling I don't think we can just throw exceptions here.
	throw new SpreadException("Illegal Message: Message Dropped");
    }

    // The type.
    var type; // A short
    
    // Is this a regular message?
    if ( (serviceType & Connection.REGULAR_MESS && ! serviceType & Connection.REJECT_MESS) || serviceType & Connection.REJECT_MESS) {
			
	// Get the type from the hint.
	hint = clearEndian(hint);
	hint >>= 8;
	hint &= 0x0000FFFF;
	type = hint;
    }
    else {
	// This is not a regular message.
	type = -1;
    }

    if( serviceType & Connection.REJECT_MESS ) {
        // Read in the old type and or with reject type field.

        var oldType = this.readInt();
	if ( oldType === null ) {
	    return false;
	}
	
        serviceType = (SpreadMessage.REJECT_MESS | oldType);
    }

    // Read in the group names.
    var buffer = this.copyBytes(numGroups * MAX_GROUP_NAME);
    if ( buffer === null ) {
	return false;
    }
    
    // Clear the endian type.
    serviceType = clearEndian(serviceType); // TODO don't know why we're doing this?

    // Get the groups from the buffer.
    var groups = [];
    for(var bufferIndex = 0 ; bufferIndex < buffer.length ; bufferIndex += MAX_GROUP_NAME)
    {
	// Translate the name into a group and add it to the vector.
	var group = buffer.toString( 'ascii', bufferIndex, bufferIndex + MAX_GROUP_NAME);
	group = group.substr(0, group.indexOf("\u0000"));
	groups.push(group);
    }
    
    // Read in the data.
    var data = this.copyBytes(dataLen);
    if (data === null) {
	return false;
    }

    return [serviceType, sender, groups, type, littleEndian, data];
}

Connection.prototype._data = function(data) {

    try {
	if (this.buffer.length == 0) {
	    this.buffer = data;
	}
	else {
	    var oldBuffer = this.buffer;
	    this.buffer = new Buffer(oldBuffer.length + data.length);
	    oldBuffer.copy(this.buffer);
	    data.copy(this.buffer, oldBuffer.length);
	}
	this.offset = 0;
	
	var read = 0;
	
	switch (this.state) {
	    
	case STATE_CONNECT_SENT:
	    // Recv the authentication method list
	    if (! this.readAuthMethods()) {
		return;
	    }
	    
	    // Send auth method choice
	    this.sendAuthMethod();

	    this.state = STATE_AUTH_METHOD_SENT;
	    break;
	    
	case STATE_AUTH_METHOD_SENT:
	    // Check for acceptance.
	    if ( ! this.checkAccept() ) {
		return;
	    }
	    
	    // Check the version.
	    if ( ! this.checkVersion() ) {
		return;
	    }
	    
	    // Get the private group name.
	    if ( ! this.readGroup() ) {
		return;
	    }
	    
	    // Connection complete.
	    this.state = STATE_CONNECTED;
	    this.emit("connect");
	    break;

	case STATE_CONNECTED:
	    var result = this.internal_receive();
	    if ( Array.isArray(result) ) {
		result.unshift("receive");
		this.emit.apply(this, result);
	    } else {
		return;
	    }
	    break;
	}

	this.buffer = this.buffer.slice(this.offset);
    } catch (e) {
	this.emit("error", e);
    }
};

Connection.prototype.connect = function(address, port, privateName, priority, groupMembership) {
    if ( ! (this instanceof Connection) ) {
	var mbox = new Connection();
	mbox.connect(address, port, privateName, priority, groupMembership);
	return mbox;
    }
    
    // Check if we're connected.
    if(this.connected == true)
    {
	throw new SpreadException("Already connected.");
    }

    // Store member variables.
    this.address = address;
    this.port = port;
    this.privateName = privateName;
    this.priority = priority;
    this.groupMembership = groupMembership;
    
    // Check if no address was specified.
    if( ! this.address)
    {
	this.address = "localhost";
    }
    
    // Check if no port was specified.
    if( ! this.port)
    {
	// Use the default port.
	port = DEFAULT_SPREAD_PORT;
    }
    
    // Check if the port is out of range.
    if((this.port < 0) || (this.port > (32 * 1024)))
    {
	throw new SpreadException("Bad port (" + this.port + ").");
    }
    
    // Create the socket.
    this.socket = net.createConnection(this.port, this.address);
    
    this.socket.setNoDelay(true);

    var that = this;
    
    this.socket.on('connect', function() {
	that._connect();	
    });

    this.socket.on('data', function(data) {
	that._data(data);
    });

};

Connection.connect = Connection.prototype.connect;

Connection.prototype.disconnect = function() {

};

Connection.prototype.join = function(group) {
    this.multicast(Connection.JOIN_MESS, group, 0, '');
};

Connection.prototype.leave = function(group) {
    this.multicast(Connection.LEAVE_MESS, group, 0, '');
};

Connection.prototype.multicast = function(service_type, groups, message_type, message) {
    
    // Check if we're connected.
    if(this.state != STATE_CONNECTED)
    {
	throw new SpreadException("Not connected.");
    }

    if ( ! Array.isArray(groups) ) {
	groups = [ groups ];
    }
    
    // Calculate the total number of bytes.
    var numBytes = 16;  // serviceType, numGroups, type/hint, dataLen
    numBytes += MAX_GROUP_NAME;  // private group
    numBytes += (MAX_GROUP_NAME * groups.length);  // groups
    
    if (numBytes + message.length > MAX_MESSAGE_LENGTH )
    {
	throw new SpreadException("Message is too long for a Spread Message");
    }
    // Allocate the send buffer.
    var buffer = new Buffer(numBytes);
    buffer.fill(0);
    var bufferIndex = 0;
    
    // The service type.
    buffer.writeInt32BE(service_type, bufferIndex);
    bufferIndex += 4;

    // The private group.
    buffer.write(this.group, bufferIndex, MAX_GROUP_NAME);
    bufferIndex += MAX_GROUP_NAME;
    
    // The number of groups.
    buffer.writeInt32BE(groups.length, bufferIndex);
    bufferIndex += 4;
    
    // The message type and hint.
    buffer.writeInt32BE((message_type << 8) & 0x00FFFF00, bufferIndex);
    bufferIndex += 4;
    
    // The data length.
    buffer.writeInt32BE(message.length, bufferIndex);
    bufferIndex += 4;
    
    // The group names.
    for(var i = 0 ; i < groups.length ; i++)
    {
	buffer.write(groups[i], bufferIndex, MAX_GROUP_NAME);
	bufferIndex += MAX_GROUP_NAME;
    }
    
    // Send it.
    this.socket.write(buffer);
    if (message.length > 0) {
	this.socket.write(message);
    }
    
};

module.exports = Connection
