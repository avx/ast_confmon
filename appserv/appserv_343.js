var debug = 0;

/* Asterisk AMI connection */
var AMI_HOST = '127.0.0.1';
var AMI_PORT = 5038;
var AMI_USER = 'admin';
var AMI_PASS = 'admin';

require ("/usr/local/asterisk/appserv/js.js");
var net = require("net");

process.title="appserv: 343 #"+process.argv[2];

var app = require('http').createServer()
  , io = require('socket.io').listen(app)

app.listen(9343);

io.enable('browser client minification');  // send minified client
io.enable('browser client etag');          // apply etag caching logic based on version number
io.enable('browser client gzip');          // gzip the file
io.set('log level', 1);                    // reduce logging

io.set('heartbeat interval', 40);
io.set('heartbeat timeout', 90);

//io.set('transports', [ 'websocket'  , 'flashsocket' , 'htmlfile' , 'xhr-polling' , 'jsonp-polling']);
io.set('transports', [ 'websocket', 'xhr-polling', 'jsonp-polling']);

io.sockets.on('connection', function (socket) {
  socket.on('subscribe', function (data) {
    if (data=='confs') {
	socket.join('confs');
	socket.emit('confs', confs);
    }
    if (data.match(/^(\d{4})$/)) {
	socket.join(data);
	if (!m[data]) m[data]=new Object();
        socket.emit('list', m[data]);
    }
  });
  socket.on('unixtime', function (data) {
	socket.emit('unixtime',Math.round(new Date().getTime()/1000));
  });
  socket.on('toggle_mute', function(data) {
	console.log(new Date()+ ": "+socket.handshake.address.address+" : toggle mute "+data.conf+" "+data.chan);
	if (debug) console.log(data);
	if (data.conf && data.chan) {
	    if (m[data.conf])
		if (m[data.conf][data.chan])
			if (m[data.conf][data.chan].m) 
			    client.write('Action: ConfBridgeUnmute\r\nConference: '+data.conf+'\r\nChannel: '+data.chan+'\r\n\r\n');
			else
			    client.write('Action: ConfBridgeMute\r\nConference: '+data.conf+'\r\nChannel: '+data.chan+'\r\n\r\n');
	}
  });
  socket.on('mute', function(data) {
	if (debug) console.log(data);
	if (data.conf && data.chan) 
		client.write('Action: ConfBridgeMute\r\nConference: '+data.conf+'\r\nChannel: '+data.chan+'\r\n\r\n');
  });
  socket.on('unmute', function(data) {
	if (debug) console.log(data);
	if (data.conf && data.chan)
		client.write('Action: ConfBridgeUnmute\r\nConference: '+data.conf+'\r\nChannel: '+data.chan+'\r\n\r\n');
  });
  socket.on('kick', function(data) {
	console.log(new Date()+ ": "+socket.handshake.address.address+" : kick "+data.conf+" "+data.chan);
	if (debug) console.log(data);
	if (data.conf && data.chan)
	    	client.write('Action: ConfBridgeKick\r\nConference: '+data.conf+'\r\nChannel: '+data.chan+'\r\n\r\n');
  });
});

var emit_needs=new Object();

setInterval(function (){ 
    for (var c in emit_needs) {
	if (emit_needs[c]) {
	    if (debug) console.log("Emit event for room \""+c+"\"");
	    if (c=='confs') {
	        if (!confs) confs=new Object();
		io.sockets.in('confs').emit('confs', confs);
	    }
	    else {
	        if (!m[c]) m[c]=new Object();
	        io.sockets.in(c).emit('list', m[c]);
	    }
	    emit_needs[c]=0;
	}
    }
},1000);

function memberlist(conf) {
    if (debug) console.log ("memberlist("+conf+")");
    client.write('Action: ConfBridgeList\r\nConference: '+conf+'\r\n\r\n');
}

function conflist() {
    if (debug) console.log ("conflist()");
    client.write('Action: ConfBridgeListRooms\r\n\r\n');
}

var client = new net.Socket();

var Data='';
var cl_inv;

client.on('error', function(err) {
    console.log(err);
    process.exit(1);
});

client.on('close', function() {
    console.log('Connection closed, exiting...');
    process.exit(1);
});

client.connect(AMI_PORT, AMI_HOST, function() {
    client.setKeepAlive(true);
    if (debug) console.log('Connected to: ' + AMI_HOST + ':' + AMI_PORT);
    client.write('Action: Login\r\nUsername: '+AMI_USER+'\r\nSecret: '+AMI_PASS+'\r\n\r\n');
});

client.on('data', function(data) {
//    console.time("onData");
    Data=Data+data;

    while (1) {
	var pA=Data.search(/\r\n\r\n/);
	if (pA<0) break;
	else {
	    var sData=Data.slice(pA+4);
	    var pB=sData.search(/\r\n\r\n/);
	    if (pB<0) break;
	    else {
		var resp=sData.slice(0,pB);
//		console.time("parseSection");
		parseSection(resp);
//		console.timeEnd("parseSection");
		Data=sData.slice(pB);
	    }
	}
    }
//    console.timeEnd("onData");
});

var start=new Object();
var start_tmp=new Object();

var confs=new Object();
var confs_tmp=new Object();

var m=new Object();
var m_tmp=new Object();

var conf;

function parseSection(data) {
    var item=new Object();
    var str=data.split('\r\n');

    for (var i in str) {
        var entry=str[i].split(': ');
	item[entry[0]]=entry[1];
    }

    if (item["Response"] == "Error") {
	if (item["Message"] == "No active conferences.") {
	    if (JSON.stringify(confs) != JSON.stringify(confs_tmp))  {
		emit_needs['confs']=1;
		if (debug) console.log(JSON.stringify(confs));
		if (debug) console.log(JSON.stringify(confs_tmp));
	    }
	    m=new Object();
	    confs_tmp=new Object();
	    confs=new Object();
	    return;
	}
    }

    if (item["Response"] == "Success") {
	if (item["EventList"] == "start") {
	    return;
	}
    }

    switch (item["Event"]) {
	case "ConfbridgeListRooms":
	    var id=item['Conference'];
	    confs_tmp[id]=new Object();
	    confs_tmp[id]['M']=item['Parties'];
//	    confs_tmp[id]['marked']=item['Marked'];
//	    confs_tmp[id]['locked']=(item['Locked']=='No'?0:1);
	    break;

	case "ConfbridgeListRoomsComplete":
            for (var id in m) 
		if (!confs[id]) m[id]={};

	    if (JSON.stringify(confs) != JSON.stringify(confs_tmp)) emit_needs['confs']=1;

	    confs=confs_tmp;
	    confs_tmp=new Object();
	    break;

	case "CoreShowChannel":
	    start_tmp[item['Channel']]=item['UniqueID'].split('.')[0];
	    break;

	case "CoreShowChannelsComplete":
	    start=start_tmp;
	    start_tmp=new Object();
	    break;

	case "ConfbridgeList":
	    var id=item['Conference'];
	    var chan=item['Channel'];

	    if (!m[id])
	    	m[id]=new Object();

	    if (!m[id][chan])
	    	m[id][chan]=new Object();

	    m[id][chan].N=item['CallerIDNum'];
	    m[id][chan].n=item['CallerIDName']
	    m[id][chan].C=item['Channel'];
	    m[id][chan].T=(item['Talking']=='1'?1:0);
	    m[id][chan].m=(item['Muted']=='1'?1:0);
//	    m[id][chan].A=(item['Admin']=='Yes'?1:0);
//	    m[id][chan].X=(item['MarkedUser']=='Yes'?1:0);
//	    m[id][chan].D=dur[item['Channel']];
	    m[id][chan].S=start[item['Channel']];
	    conf=id;

	    break;
	
	case "ConfbridgeListComplete":
	    if (debug) { console.log(conf+": ConfbridgeListComplete");
	    console.log(item);
	    console.log(m[conf]);
	    console.log("\n\n");
	    }

	    emit_needs[conf]=1;
	    break;

	case "ConfbridgeMute":
	    var id=item['Conference'];
	    var chan=item['Channel']
	    var muted=(item['MuteStatus']=='on'?1:0);
	    if (m[id]) 
		if (m[id][chan])
			m[id][chan].m=muted;

	    var t=new Object();
	    t[chan]=new Object();
	    t[chan].m=muted;
	    io.sockets.in(id).emit('upd',t);
	    break;

	case "ConfbridgeTalking":
	    var id=item['Conference'];
	    var chan=item['Channel'];
	    var talking=(item['TalkingStatus']=='on'?1:0);
	    if (m[id])
		if (m[id][chan])
			m[id][chan].T=talking;

	    var t=new Object();
	    t[chan]=new Object();
	    t[chan].T=talking;
	    io.sockets.in(id).emit('upd',t);
	    break;

	case "ConfbridgeJoin":
	    start[item['Channel']]=item['Uniqueid'].split('.')[0];
	    if (debug) console.log(item['Conference']+": ConbridgeJoin");
	    conflist();
	    memberlist(item['Conference']);
	    break;

	case "ConfbridgeLeave":
	    var id=item['Conference'];
	    var chan=item['Channel'];
	
	    if (debug) console.log(item['Conference']+": ConbridgeLeave");
	    if (m[id])
		if (m[id][chan])
		    delete m[id][chan];

	    setTimeout(function () {
		if (debug) console.log("setTimeout runned");
		conflist();
		emit_needs[id]=1;
//		memberlist(item['Conference']);
	    },1000);
	    break;

	case "FullyBooted":
	    // we are ready
	    conflist();
	    setTimeout(function() {
		client.write('Action: CoreShowChannels\r\n\r\n');
		for (var id in confs) client.write('Action: ConfBridgeList\r\nConference: '+id+'\r\n\r\n');
	    },200);
	    cl_inv=setInterval(conflist,45000);
	    break;

	case "ConfbridgeEnd":
	    if (m[item['Conference']])
		m[item['Conference']]={};

	    if (confs[item['Conference']])
		delete confs[item['Conference']];

	    emit_needs['confs']=1;
	    emit_needs[item['Conference']]=1;
	    break;

	case "RTCPSent":
	    break;

	default:
//	    console.log(item);
	    break;
    }
}
