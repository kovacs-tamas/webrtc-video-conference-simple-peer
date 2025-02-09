/**
 * Socket.io socket
 */
let socket;
/**
 * The stream object used to send media
 */
let localStream = null;
/**
 * All peer connections
 */
let peers = {};

// redirect if not https
if (location.href.substr(0, 5) !== 'https')
  location.href = 'https' + location.href.substr(4, location.href.length - 4);

//////////// CONFIGURATION //////////////////

/**
 * RTCPeerConnection configuration
 */
const configuration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302',
    },
    // public turn server from https://gist.github.com/sagivo/3a4b2f2c7ac6e1b5267c2f1f59ac6c6b
    // set your own servers here
    {
      url: 'turn:192.158.29.39:3478?transport=udp',
      credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
      username: '28224511:1379330808',
    },
  ],
};

/**
 * UserMedia constraints
 */
let constraints = {
  audio: true,
  video: true,
};

/////////////////////////////////////////////////////////

constraints.video.facingMode = {
  ideal: 'user',
};

// enabling the camera at startup
navigator.mediaDevices
  .getUserMedia(constraints)
  .then((stream) => {
    console.log('Received local stream');

    localVideo.srcObject = stream;
    localStream = stream;

    init();
  })
  .catch((e) => alert(`getusermedia error ${e.name}`));

/**
 * initialize the socket connections
 */
function init() {
  socket = io();

  socket.on('initReceive', (socket_id) => {
    console.log('INIT RECEIVE ' + socket_id);
    addPeer(socket_id, false);

    socket.emit('initSend', socket_id);
  });

  socket.on('initSend', (socket_id) => {
    console.log('INIT SEND ' + socket_id);
    addPeer(socket_id, true);
  });

  socket.on('removePeer', (socket_id) => {
    console.log('removing peer ' + socket_id);
    removePeer(socket_id);
  });

  socket.on('disconnect', () => {
    console.log('GOT DISCONNECTED');
    for (let socket_id in peers) {
      removePeer(socket_id);
    }
  });

  socket.on('signal', (data) => {
    peers[data.socket_id].signal(data.signal);
  });
}

/**
 * Remove a peer with given socket_id.
 * Removes the video element and deletes the connection
 * @param {String} socket_id
 */
function removePeer(socket_id) {
  let videoEl = document.getElementById(socket_id);
  if (videoEl) {
    const tracks = videoEl.srcObject.getTracks();

    tracks.forEach(function (track) {
      track.stop();
    });

    videoEl.srcObject = null;
    videoEl.parentNode.removeChild(videoEl);
  }
  if (peers[socket_id]) peers[socket_id].destroy();
  delete peers[socket_id];
}

/**
 * Creates a new peer connection and sets the event listeners
 * @param {String} socket_id
 *                 ID of the peer
 * @param {Boolean} am_initiator
 *                  Set to true if the peer initiates the connection process.
 *                  Set to false if the peer receives the connection.
 */
function addPeer(socket_id, am_initiator) {
  peers[socket_id] = new SimplePeer({
    initiator: am_initiator,
    stream: localStream,
    config: configuration,
  });

  peers[socket_id].on('signal', (data) => {
    socket.emit('signal', {
      signal: data,
      socket_id: socket_id,
    });
  });

  peers[socket_id].on('stream', (stream) => {
    let newVid = document.createElement('video');
    newVid.srcObject = stream;
    newVid.id = socket_id;
    newVid.playsinline = false;
    newVid.autoplay = true;
    newVid.className = 'vid';
    newVid.onclick = () => openPictureMode(newVid);
    newVid.ontouchstart = (e) => openPictureMode(newVid);
    videos.appendChild(newVid);
  });
}

/**
 * Opens an element in Picture-in-Picture mode
 * @param {HTMLVideoElement} el video element to put in pip mode
 */
function openPictureMode(el) {
  console.log('opening pip');
  el.requestPictureInPicture();
}

/**
 * Switches the camera between user and environment. It will just enable the camera 2 cameras not supported.
 */
function switchMedia() {
  if (constraints.video.facingMode.ideal === 'user') {
    constraints.video.facingMode.ideal = 'environment';
  } else {
    constraints.video.facingMode.ideal = 'user';
  }

  const tracks = localStream.getTracks();

  tracks.forEach(function (track) {
    track.stop();
  });

  localVideo.srcObject = null;
  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    for (let socket_id in peers) {
      for (let index in peers[socket_id].streams[0].getTracks()) {
        for (let index2 in stream.getTracks()) {
          if (
            peers[socket_id].streams[0].getTracks()[index].kind ===
            stream.getTracks()[index2].kind
          ) {
            peers[socket_id].replaceTrack(
              peers[socket_id].streams[0].getTracks()[index],
              stream.getTracks()[index2],
              peers[socket_id].streams[0]
            );
            break;
          }
        }
      }
    }

    localStream = stream;
    localVideo.srcObject = stream;

    updateButtons();
  });
}

/**
 * Enable screen share
 */
function setScreen() {
  navigator.mediaDevices.getDisplayMedia().then((stream) => {
    for (let socket_id in peers) {
      for (let index in peers[socket_id].streams[0].getTracks()) {
        for (let index2 in stream.getTracks()) {
          if (
            peers[socket_id].streams[0].getTracks()[index].kind ===
            stream.getTracks()[index2].kind
          ) {
            peers[socket_id].replaceTrack(
              peers[socket_id].streams[0].getTracks()[index],
              stream.getTracks()[index2],
              peers[socket_id].streams[0]
            );
            break;
          }
        }
      }
    }
    localStream = stream;

    localVideo.srcObject = localStream;
    socket.emit('removeUpdatePeer', '');
  });
  updateButtons();
}

/**
 * Disables and removes the local stream and all the connections to other peers.
 */
function removeLocalStream() {
  if (localStream) {
    const tracks = localStream.getTracks();

    tracks.forEach(function (track) {
      track.stop();
    });

    localVideo.srcObject = null;
  }

  for (let socket_id in peers) {
    removePeer(socket_id);
  }
}

/**
 * Enable/disable microphone
 */
function toggleMute() {
  for (let index in localStream.getAudioTracks()) {
    localStream.getAudioTracks()[index].enabled =
      !localStream.getAudioTracks()[index].enabled;
    if (localStream.getAudioTracks()[index].enabled) {
      muteButtonOn.style.display = 'block';
      muteButtonOff.style.display = 'none';
    } else {
      muteButtonOn.style.display = 'none';
      muteButtonOff.style.display = 'block';
    }
  }
}
/**
 * Enable/disable video
 */
function toggleVid() {
  for (let index in localStream.getVideoTracks()) {
    localStream.getVideoTracks()[index].enabled =
      !localStream.getVideoTracks()[index].enabled;

    if (localStream.getVideoTracks()[index].enabled) {
      vidButtonOn.style.display = 'block';
      vidButtonOff.style.display = 'none';
    } else {
      vidButtonOn.style.display = 'none';
      vidButtonOff.style.display = 'block';
    }
  }
}

/**
 * updating text of buttons
 */
function updateButtons() {
  for (let index in localStream.getVideoTracks()) {
    if (localStream.getVideoTracks()[index].enabled) {
      vidButtonOn.style.display = 'block';
      vidButtonOff.style.display = 'none';
    } else {
      vidButtonOn.style.display = 'none';
      vidButtonOff.style.display = 'block';
    }
  }
  for (let index in localStream.getAudioTracks()) {
    if (localStream.getAudioTracks()[index].enabled) {
      muteButtonOn.style.display = 'block';
      muteButtonOff.style.display = 'none';
    } else {
      muteButtonOn.style.display = 'none';
      muteButtonOff.style.display = 'block';
    }
  }
}
