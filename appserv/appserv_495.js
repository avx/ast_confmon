var debug = 0;

/* Asterisk AMI connection */
var AMI_HOST = '192.168.0.1';
var AMI_PORT = 5038;
var AMI_USER = 'admin';
var AMI_PASS = 'admin';

require ("/usr/local/asterisk/appserv/js.js");
var net = require("net");

process.title="appserv: 495 #"+process.argv[2];

var app = require('http').createServer()
  , io = require('socket.io').listen(app)

app.listen(9495);

io.enable('browser client minification');  // send minified client
io.enable('browser client etag');          // apply etag caching logic based on version number
io.enable('browser client gzip');          // gzip the file
io.set('log level', 0);                    // reduce logging

io.set('heartbeat interval', 40);
io.set('heartbeat timeout', 90);

//io.set('transports', [ 'websocket'  , 'flashsocket' , 'htmlfile' , 'xhr-polling' , 'jsonp-polling']);
//io.set('transports', [ 'websocket', 'xhr-polling', 'jsonp-polling']);
io.set('transports', [ 'websocket', 'xhr-polling', 'jsonp-polling']);

io.sockets.on('connection', function (socket) {
  socket.on('subscribe', function (data) {
    if (data=='confs') {
	socket.join('confs');
	socket.emit('confs', confs);
    }
    if ((''+data).match(/^(\d{4})$/)) {
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
      if (data.conf && data.chan)
          if (m[data.conf])
              if (m[data.conf][data.chan])
                  if (m[data.conf][data.chan].m) 
		      client.write('Action: Command\r\nCommand: meetme unmute '+data.conf+' '+data.chan+'\r\n\r\n');
                  else
		      client.write('Action: Command\r\nCommand: meetme mute '+data.conf+' '+data.chan+'\r\n\r\n');
  });

  socket.on('mute', function(data) {
        if (debug) console.log(data);
        if (data.conf && data.chan) 
	    client.write('Action: Command\r\nCommand: meetme mute '+data.conf+' '+data.chan+'\r\n\r\n');
  });
  socket.on('unmute', function(data) {
        if (debug) console.log(data);
        if (data.conf && data.chan)
	    client.write('Action: Command\r\nCommand: meetme unmute '+data.conf+' '+data.chan+'\r\n\r\n');
  });
  socket.on('kick', function(data) {
        console.log(new Date()+ ": "+socket.handshake.address.address+" : kick "+data.conf+" "+data.chan);
        if (debug) console.log(data);
        if (data.conf && data.chan)
    	    client.write('Action: Command\r\nCommand: meetme kick '+data.conf+' '+data.chan+'\r\n\r\n');
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


var cstack=new Array;

function memberlist(conf) {
    if (debug) console.log ("memberlist("+conf+")");
    cstack.push(conf);
    client.write('Action: Command\r\nCommand: meetme list '+conf+' concise\r\n\r\n');
}

function conflist() {
    if (debug) console.log ("conflist()");
    cstack.push('confs');
    client.write('Action: Command\r\nCommand: meetme concise\r\n\r\n');
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
    conflist();
    setTimeout(function() {
	for (var id in confs) memberlist(id);
    },200);
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

var confs=new Object();
var confs_tmp=new Object();

var m=new Object();
var m_tmp=new Object();

function sec(hms) {
    var e=(''+hms).split(':');
    return parseInt(e[2],10)+parseInt(e[1],10)*60+parseInt(e[0],10)*3600;
}

function parseCommand(data) {
	var str=data.split('\n');
	var id=cstack.shift();
	var emit=0;

	for (var i in str) {
	    if (str[i]=="--END COMMAND--") break;
	    d=str[i].split('!');
	    if (id=='confs') {
		confs_tmp[d[0]]=new Object();
	    	confs_tmp[d[0]]['M']=d[1];
	    }
	    else {
		if (!m[id]) 
			m[id]=new Object();
		if (!m[id][d[0]]) 
			m[id][d[0]]=new Object();

	    	m[id][d[0]].N=d[1];
		m[id][d[0]].n=d[2];
	    	m[id][d[0]].C=d[3];
	    	m[id][d[0]].m=(d[6]==''?0:1);
	    	m[id][d[0]].T=(d[8]=='0'?0:1);
//	    	m[id][d[0]].D=d[9];
	    	m[id][d[0]].S=Math.round(new Date().getTime()/1000)-sec(d[9]);
	    }
	}

	if (id=='confs') {
	    if (i==0) {
	        m=new Object();
	        confs=new Object();
	    }

	    if (JSON.stringify(confs) != JSON.stringify(confs_tmp)) emit=1;
	    confs=confs_tmp;
    	    confs_tmp=new Object();
	    if (emit) emit_needs['confs']=1;
	}
	else if (id) {
	    emit_needs[id]=1;

       	    for (var id in m)
		if (!confs[id]) m[id]={};
	}

	return; 
}


function parseSection(data) {
    var str=data.split('\r\n');

    if (str[0]=="Response: Follows" && str[1]=="Privilege: Command") {
	parseCommand(str[2]);
	return;
    }

    var item=new Object();

    for (var i in str) {
        var entry=str[i].split(': ');
	item[entry[0]]=entry[1];
    }

    switch (item["Event"]) {
	case "MeetmeTalking":
	//	{ Event: 'MeetmeTalking',
	//	Privilege: 'call,all',
  	//	Channel: 'H323/ip$172.24.177.2:18270/26908',
  	//	Uniqueid: '1392286710.6097',
  	//	Meetme: '1799',
  	//	Usernum: '1',
  	//	Status: 'on' }
	    var id=item['Meetme'];
	    var chan=item['Usernum']
	    var talking=(item['Status']=='on'?1:0);
	    if (m[id]) 
		if (m[id][chan])
			m[id][chan].T=talking

	    var t=new Object();
	    t[chan]=new Object();
	    t[chan].T=talking
	    io.sockets.in(id).emit('upd',t);
	    break;

	case "MeetmeMute":
	//Event: MeetmeMute
	//Privilege: call,all
	//Channel: H323/ip$172.24.177.3:16995/26803
	//Uniqueid: 1392283966.6085
	//Meetme: 1799
	//Usernum: 1
	//Status: on

	//Event: MeetmeMute
	//Privilege: call,all
	//Channel: H323/ip$172.24.177.3:16995/26803
	//Uniqueid: 1392283966.6085
	//Meetme: 1799
	//Usernum: 1
	//Status: off
	    var id=item['Meetme'];
	    var chan=item['Usernum']
	    var muted=(item['Status']=='on'?1:0);
	    if (m[id]) 
		if (m[id][chan])
			m[id][chan].m=muted

	    var t=new Object();
	    t[chan]=new Object();
	    t[chan].m=muted
	    io.sockets.in(id).emit('upd',t);
	    break;

	case "MeetmeJoin":
	//{ Event: 'MeetmeJoin',
	//  Privilege: 'call,all',
	//  Channel: 'H323/ip$172.24.177.2:18270/26908',
	//  Uniqueid: '1392286710.6097',
	//  Meetme: '1799',
	//  Usernum: '1',
	//  CallerIDnum: '3431304',
	//  CallerIDname: 'A.Vysokovskih' }
	    if (debug>3) console.log(item['Meetme']+": MeetmeJoin");
	    conflist();
	    memberlist(item['Meetme']);
	    break;

	case "MeetmeLeave":
	//	{ Event: 'MeetmeLeave',
	//	  Privilege: 'call,all',
	//	  Channel: 'H323/ip$172.24.177.2:18270/26908',
	//	  Uniqueid: '1392286710.6097',
	//	  Meetme: '1799',
	//	  Usernum: '1',
	//	  CallerIDNum: '3431304',
	//	  CallerIDName: 'A.Vysokovskih',
	//	  Duration: '38' }
	    var id=item['Meetme'];
	    var chan=item['Usernum'];

	    if (debug>3) console.log(id+": MeetmeLeave");
	    if (m[id]) 
		if (m[id][chan]) {
		    if (debug>3) console.log("DELETING "+id+" "+chan);
		    delete m[id][chan];
		}

	    setTimeout(function () { 
		conflist(); 
		emit_needs[id]=1; 
	    },1000);
//	    setTimeout(function () { memberlist(id); },1000);
	    break;

	case "FullyBooted":
	    break;

	case "MeetmeEnd":
	//	{ Event: 'MeetmeEnd', Privilege: 'call,all', Meetme: '1799' }
	    if (m[item['Meetme']]) 
		m[item['Meetme']]={};

	    if (confs[item['Meetme']]) {
		delete confs[item['Meetme']];
		if (debug>3) console.log("delete "+item['Meetme']);
	    }

	    if (debug>3) console.log("meetmeend + emits");
	    emit_needs['confs']=1;
	    emit_needs[item['Meetme']]=1;
	    break;

	case "RTCPSent":
	    break;

	default:
//	    console.log(item);
	    break;
    }
}
