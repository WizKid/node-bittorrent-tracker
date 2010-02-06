var http = require("http");
var url = require("url");
var sys = require("sys");
var querystring = require("querystring");

function Peer(id, host, port) {
    this.id = id;
    this.compact_hostport = this.compact(host, port);
    this.touch();
}

Peer.prototype = {
    touch: function() {
        this.last_action = (new Date()).valueOf();
    },
    compact: function(host, port) {
        c = "";
        parts = host.split(".");
        if (parts.length != 4)
            throw "Wrongly formatted ip-adress";

        p = parseInt(port);
        if (p >= 65536 || p < 0)
            throw "Wrongly formatted port number";

        for (var i = 0; i < 4; i++)
            c += String.fromCharCode(parseInt(parts[i]));

        c += String.fromCharCode(p >> 8);
        c += String.fromCharCode(p & 255);
        return c;
    }
}

function File() {
    this.peerList = [];
    this.peers = {};
    this.downloads = 0;
    this.downloading = 0;
    this.uploading = 0;
}

File.prototype = {
    addPeer: function(peer) {
        if (typeof(this.peers[peer.id]) != "undefined") {
            sys.puts("Update a old peer");
            // Update the old peer object
        } else {
            sys.puts("Add a new peer");
            this.peerList.push(peer);
            this.peers[peer.id] = peer;
        }
    },
    getPeers: function(count) {
        var c = Math.min(this.peerList.length, count);
        var ret = "";
        for (var i = 0; i < c; i++) {
            var index = Math.floor(Math.random() * this.peerList.length);
            sys.puts("index: "+ index);
            ret += this.peerList[index].compact_hostport;
        }
        return ret;
    }
}

function Tracker() {
    this.files = {}
}

Tracker.prototype = {
    getFile: function(info_hash) {
        if (typeof this.files[info_hash] == "undefined")
            return this.addFile(info_hash);

        sys.puts("Return old file");
        return this.files[info_hash];
    },
    addFile: function(info_hash) {
        sys.puts("Create new file");
        var file = new File();
        this.files[info_hash] = file;
        return file;
    }
}


var tracker = new Tracker();

function sendError(res, message) {
    res.sendHeader(503, {
        "Content-Length": message.length,
        "Content-Type": "text/plain"
    });

    res.sendBody(message);
    res.finish();
}

// The requests that utorrent (and probably other) makes can't be urldecoded
// using decodeURIComponent so decode the querystring using unescape and then
// endocde it using encodeURIComponent. Which makes it possible for the
// querystring lib to parse it.
function fixUrlEncoding(url) {
    var newurl = "";
    for (var i = 0; i < url.length; i++) {
        if (url[i] != "%") {
            newurl += url[i];
            continue;
        }

        newurl += encodeURIComponent(unescape(url.substr(i, 3)));
        i += 2;
    }
    return newurl;
}

var server = http.createServer(function (req, res) {
    var params = url.parse(req.url);
    var query = querystring.parse(fixUrlEncoding(params["query"]), null, null, true);

    if (typeof query["info_hash"] == "undefined" ||
        typeof query["peer_id"] == "undefined" ||
        typeof query["port"] == "undefined" ||
        typeof query["left"] == "undefined") {
        sendError(res, "Missing query variables");
        return;
    }

    var peer = new Peer(query["peer_id"], req.connection.remoteAddress, query["port"], query["left"]);
    var file = tracker.getFile(query["info_hash"]);
    file.addPeer(peer);
    var peers = file.getPeers(10);

    var body = "d8:intervali10e5:peers"+ peers.length +":"+ peers +"e";
    res.sendHeader(200, {
        "Content-Length": body.length,
        "Content-Type": "text/plain"
    });

    res.sendBody(body);
    res.finish();
});

server.listen(80);