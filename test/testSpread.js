//These tests require that a spead server is running on localhost on the default ports

var assert = require("assert");

var spread = require(__dirname+"/../");


describe('spread', function() {
    describe('#connect', function () {
        it('Should be able to connect to a Spread Daemon', function (done) {
            var mbox = spread.connect("localhost", 4803 ,"testuser",0,0);

            mbox.on("connect", function(){
               done();
            });  
        });

        it('Should be able to join a channel', function (done){
            var mbox = spread.connect("localhost", 4803 ,"testuser1",0,0);

            mbox.on("connect", function(){
                mbox.join("testchannel");
                setTimeout(function(){
                    done();
                },33)
                
            });
        });

        it('Should be able to send messages to a channel', function (done){
            var mbox = spread.connect("localhost", 4803 ,"testuser2",0,0);

            mbox.on("connect", function(){
                mbox.join('testchannel')
                mbox.multicast(spread.SAFE_MESS, ['testchannel'], 0, new Buffer([1,2,3,4,5]));
            });

            mbox.on("receive", function(){
                done();
            })
        });
    });
});