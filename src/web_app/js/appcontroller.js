/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

/* More information about these options at jshint.com/docs/options */

/* globals trace, InfoBox, setUpFullScreen, isFullScreen,
   RoomSelection, isChromeApp, $ */
/* exported AppController, remoteVideo */

'use strict';

// TODO(jiayl): remove |remoteVideo| once the chrome browser tests are updated.
// Do not use in the production code.
var remoteVideo = $('#remote-video');

// Keep this in sync with the HTML element id attributes. Keep it sorted.
var UI_CONSTANTS = {
  confirmJoinButton: '#confirm-join-button',
  confirmJoinDiv: '#confirm-join-div',
  confirmJoinRoomSpan: '#confirm-join-room-span',
  enableVRSvg: '#enable-vr',
  fullscreenSvg: '#fullscreen',
  hangupSvg: '#hangup',
  icons: '#icons',
  infoDiv: '#info-div',
  localVideo: '#local-video',
  miniVideo: '#mini-video',
  muteAudioSvg: '#mute-audio',
  muteVideoSvg: '#mute-video',
  newRoomButton: '#new-room-button',
  newRoomLink: '#new-room-link',
  privacyLinks: '#privacy',
  remoteVideo: '#remote-video',
  remoteVideoContainer: '#remote-video-container',
  rejoinButton: '#rejoin-button',
  rejoinDiv: '#rejoin-div',
  rejoinLink: '#rejoin-link',
  roomLinkHref: '#room-link-href',
  roomSelectionDiv: '#room-selection',
  roomSelectionInput: '#room-id-input',
  roomSelectionInputLabel: '#room-id-input-label',
  roomSelectionJoinButton: '#join-button',
  roomSelectionRandomButton: '#random-button',
  roomSelectionRecentList: '#recent-rooms-list',
  sharingDiv: '#sharing-div',
  statusDiv: '#status-div',
  toggleVRControlsSvg: '#vr-controls-toggle',
  videosDiv: '#videos',
};

// The controller that connects the Call with the UI.
var AppController = function(loadingParams) {
  trace('Initializing; server= ' + loadingParams.roomServer + '.');
  trace('Initializing; room=' + loadingParams.roomId + '.');

  // this.vrToggleSvg_ = $(UI_CONSTANTS.toggleVRControlsSvg);
  this.hangupSvg_ = $(UI_CONSTANTS.hangupSvg);
  this.VRControlsSvg = $(UI_CONSTANTS.toggleVRControlsSvg);
  this.icons_ = $(UI_CONSTANTS.icons);
  this.localVideo_ = $(UI_CONSTANTS.localVideo);
  this.miniVideo_ = $(UI_CONSTANTS.miniVideo);
  this.sharingDiv_ = $(UI_CONSTANTS.sharingDiv);
  this.statusDiv_ = $(UI_CONSTANTS.statusDiv);
  this.remoteVideo_ = $(UI_CONSTANTS.remoteVideo);
  this.remoteVideoContainer_ = $(UI_CONSTANTS.remoteVideoContainer);
  this.videosDiv_ = $(UI_CONSTANTS.videosDiv);
  this.roomLinkHref_ = $(UI_CONSTANTS.roomLinkHref);
  this.rejoinDiv_ = $(UI_CONSTANTS.rejoinDiv);
  this.rejoinLink_ = $(UI_CONSTANTS.rejoinLink);
  this.newRoomLink_ = $(UI_CONSTANTS.newRoomLink);
  this.rejoinButton_ = $(UI_CONSTANTS.rejoinButton);
  this.newRoomButton_ = $(UI_CONSTANTS.newRoomButton);

  this.newRoomButton_.addEventListener('click',
      this.onNewRoomClick_.bind(this), false);
  this.rejoinButton_.addEventListener('click',
      this.onRejoinClick_.bind(this), false);

  this.muteAudioIconSet_ =
      new AppController.IconSet_(UI_CONSTANTS.muteAudioSvg);
  this.muteVideoIconSet_ =
      new AppController.IconSet_(UI_CONSTANTS.muteVideoSvg);
  this.fullscreenIconSet_ =
      new AppController.IconSet_(UI_CONSTANTS.fullscreenSvg);
  this.enableVRIconSet_ =
      new AppController.IconSet_(UI_CONSTANTS.enableVRSvg);
  this.toggleVRControlsIconSet_ =
      new AppController.IconSet_(UI_CONSTANTS.toggleVRControlsSvg);

  this.loadingParams_ = loadingParams;
  this.loadUrlParams_();

  var paramsPromise = Promise.resolve({});
  if (this.loadingParams_.paramsFunction) {
    // If we have a paramsFunction value, we need to call it
    // and use the returned values to merge with the passed
    // in params. In the Chrome app, this is used to initialize
    // the app with params from the server.
    paramsPromise = this.loadingParams_.paramsFunction();
  }

  Promise.resolve(paramsPromise).then(function(newParams) {
    // Merge newly retrieved params with loadingParams.
    if (newParams) {
      Object.keys(newParams).forEach(function(key) {
        this.loadingParams_[key] = newParams[key];
      }.bind(this));
    }

    this.roomLink_ = '';
    this.roomSelection_ = null;
    this.localStream_ = null;
    this.remoteVideoResetTimer_ = null;

    // If the params has a roomId specified, we should connect to that room
    // immediately. If not, show the room selection UI.
    if (this.loadingParams_.roomId) {
      this.createCall_();

      // Ask the user to confirm.
      if (!RoomSelection.matchRandomRoomPattern(this.loadingParams_.roomId)) {
        // Show the room name only if it does not match the random room pattern.
        $(UI_CONSTANTS.confirmJoinRoomSpan).textContent = ' "' +
            this.loadingParams_.roomId + '"';
      }
      var confirmJoinDiv = $(UI_CONSTANTS.confirmJoinDiv);
      this.show_(confirmJoinDiv);

      $(UI_CONSTANTS.confirmJoinButton).onclick = function() {
        this.hide_(confirmJoinDiv);

        // Record this room in the recently used list.
        var recentlyUsedList = new RoomSelection.RecentlyUsedList();
        recentlyUsedList.pushRecentRoom(this.loadingParams_.roomId);
        this.finishCallSetup_(this.loadingParams_.roomId);
      }.bind(this);

      if (this.loadingParams_.bypassJoinConfirmation) {
        $(UI_CONSTANTS.confirmJoinButton).onclick();
      }
    } else {
      // Display the room selection UI.
      this.showRoomSelection_();
    }
  }.bind(this)).catch(function(error) {
    trace('Error initializing: ' + error.message);
  }.bind(this));
};

AppController.prototype.createCall_ = function() {
  var privacyLinks = $(UI_CONSTANTS.privacyLinks);
  this.hide_(privacyLinks);
  this.call_ = new Call(this.loadingParams_);
  this.infoBox_ = new InfoBox($(UI_CONSTANTS.infoDiv),
                              this.remoteVideo_,
                              this.call_,
                              this.loadingParams_.versionInfo);

  var roomErrors = this.loadingParams_.errorMessages;
  var roomWarnings = this.loadingParams_.warningMessages;
  if (roomErrors && roomErrors.length > 0) {
    for (var i = 0; i < roomErrors.length; ++i) {
      this.infoBox_.pushErrorMessage(roomErrors[i]);
    }
    return;
  } else if (roomWarnings && roomWarnings.length > 0) {
    for (var j = 0; j < roomWarnings.length; ++j) {
      this.infoBox_.pushWarningMessage(roomWarnings[j]);
    }
  }

  // TODO(jiayl): replace callbacks with events.
  this.call_.onremotehangup = this.onRemoteHangup_.bind(this);
  this.call_.onremotesdpset = this.onRemoteSdpSet_.bind(this);
  this.call_.onremotestreamadded = this.onRemoteStreamAdded_.bind(this);
  this.call_.onlocalstreamadded = this.onLocalStreamAdded_.bind(this);

  this.call_.onsignalingstatechange =
      this.infoBox_.updateInfoDiv.bind(this.infoBox_);
  this.call_.oniceconnectionstatechange =
      this.infoBox_.updateInfoDiv.bind(this.infoBox_);
  this.call_.onnewicecandidate =
      this.infoBox_.recordIceCandidateTypes.bind(this.infoBox_);

  this.call_.onerror = this.displayError_.bind(this);
  this.call_.onstatusmessage = this.displayStatus_.bind(this);
  this.call_.oncallerstarted = this.displaySharingInfo_.bind(this);
};

AppController.prototype.showRoomSelection_ = function() {
  var roomSelectionDiv = $(UI_CONSTANTS.roomSelectionDiv);
  this.roomSelection_ = new RoomSelection(roomSelectionDiv, UI_CONSTANTS);

  this.show_(roomSelectionDiv);
  this.roomSelection_.onRoomSelected = function(roomName) {
    this.hide_(roomSelectionDiv);
    this.createCall_();
    this.finishCallSetup_(roomName);

    this.roomSelection_.removeEventListeners();
    this.roomSelection_ = null;
    if (this.localStream_) {
      this.attachLocalStream_();
    }
  }.bind(this);
};

AppController.prototype.setupUi_ = function() {
  this.iconEventSetup_();
  document.onkeypress = this.onKeyPress_.bind(this);
  window.onmousemove = this.showIcons_.bind(this);

  $(UI_CONSTANTS.muteAudioSvg).onclick = this.toggleAudioMute_.bind(this);
  $(UI_CONSTANTS.muteVideoSvg).onclick = this.toggleVideoMute_.bind(this);
  $(UI_CONSTANTS.fullscreenSvg).onclick = this.toggleFullScreen_.bind(this);
  $(UI_CONSTANTS.enableVRSvg).onclick = this.enableVRToggle_.bind(this);
  $(UI_CONSTANTS.toggleVRControlsSvg).onclick = this.toggleVRControls_.bind(this);
  $(UI_CONSTANTS.hangupSvg).onclick = this.hangup_.bind(this);

  setUpFullScreen();

  document.addEventListener('webkitfullscreenchange',
    this.toggleFullScreenButtons_.bind(this),
    false);
  document.addEventListener('mozfullscreenchange',
    this.toggleFullScreenButtons_.bind(this),
    false);
  document.addEventListener('fullscreenchange',
    this.toggleFullScreenButtons_.bind(this),
    false);
};

AppController.prototype.finishCallSetup_ = function(roomId) {
  this.call_.start(roomId);
  this.setupUi_();

  if (!isChromeApp()) {
    // Call hangup with async = false. Required to complete multiple
    // clean up steps before page is closed.
    // Chrome apps can't use onbeforeunload.
    window.onbeforeunload = function() {
      this.call_.hangup(false);
    }.bind(this);

    window.onpopstate = function(event) {
      if (!event.state) {
        // TODO (chuckhays) : Resetting back to room selection page not
        // yet supported, reload the initial page instead.
        trace('Reloading main page.');
        location.href = location.origin;
      } else {
        // This could be a forward request to open a room again.
        if (event.state.roomLink) {
          location.href = event.state.roomLink;
        }
      }
    };
  }
};

AppController.prototype.hangup_ = function() {
  trace('Hanging up.');
  this.hide_(this.icons_);
  this.displayStatus_('Hanging up');
  this.transitionToDone_();

  // Call hangup with async = true.
  this.call_.hangup(true);
  // Reset key and mouse event handlers.
  document.onkeypress = null;
  window.onmousemove = null;
};

AppController.prototype.onRemoteHangup_ = function() {
  this.displayStatus_('The remote side hung up.');
  this.transitionToWaiting_();

  this.call_.onRemoteHangup();
};

AppController.prototype.onRemoteSdpSet_ = function(hasRemoteVideo) {
  if (hasRemoteVideo) {
    trace('Waiting for remote video.');
    this.waitForRemoteVideo_();
  } else {
    trace('No remote video stream; not waiting for media to arrive.');
    // TODO(juberti): Make this wait for ICE connection before transitioning.
    this.transitionToActive_();
  }
};

AppController.prototype.waitForRemoteVideo_ = function() {
  // Wait for the actual video to start arriving before moving to the active
  // call state.
  if (this.remoteVideo_.readyState >= 2) {  // i.e. can play
    trace('Remote video started; currentTime: ' +
          this.remoteVideo_.currentTime);
    this.transitionToActive_();
  } else {
    this.remoteVideo_.oncanplay = this.waitForRemoteVideo_.bind(this);
  }
};

AppController.prototype.onRemoteStreamAdded_ = function(stream) {
  this.deactivate_(this.sharingDiv_);
  trace('Remote stream added.');
  this.remoteVideo_.srcObject = stream;

  if (this.remoteVideoResetTimer_) {
    clearTimeout(this.remoteVideoResetTimer_);
    this.remoteVideoResetTimer_ = null;
  }
};

AppController.prototype.onLocalStreamAdded_ = function(stream) {
  trace('User has granted access to local media.');
  this.localStream_ = stream;

  if (!this.roomSelection_) {
    this.attachLocalStream_();
  }
};

AppController.prototype.attachLocalStream_ = function() {
  trace('Attaching local stream.');
  this.localVideo_.srcObject = this.localStream_;

  this.displayStatus_('');
  this.activate_(this.localVideo_);
  this.show_(this.icons_);
  if (this.localStream_.getVideoTracks().length === 0) {
    this.hide_($(UI_CONSTANTS.muteVideoSvg));
  }
  if (this.localStream_.getAudioTracks().length === 0) {
    this.hide_($(UI_CONSTANTS.muteAudioSvg));
  }
};

AppController.prototype.transitionToActive_ = function() {
  // Stop waiting for remote video.
  this.remoteVideo_.oncanplay = undefined;
  var connectTime = window.performance.now();
  this.infoBox_.setSetupTimes(this.call_.startTime, connectTime);
  this.infoBox_.updateInfoDiv();
  trace('Call setup time: ' + (connectTime - this.call_.startTime).toFixed(0) +
      'ms.');

  // Prepare the remote video and PIP elements.
  trace('reattachMediaStream: ' + this.localVideo_.srcObject);
  this.miniVideo_.srcObject = this.localVideo_.srcObject;

  // Transition opacity from 0 to 1 for the remote and mini videos.
  this.activate_(this.remoteVideo_);
  this.activate_(this.miniVideo_);
  // Transition opacity from 1 to 0 for the local video.
  this.deactivate_(this.localVideo_);
  this.localVideo_.srcObject = null;
  // Rotate the div containing the videos 180 deg with a CSS transform.
  this.activate_(this.videosDiv_);
  this.show_(this.hangupSvg_);
  this.displayStatus_('');
};

AppController.prototype.transitionToWaiting_ = function() {
  // Stop waiting for remote video.
  this.remoteVideo_.oncanplay = undefined;

  this.hide_(this.hangupSvg_);
  if (this.remoteVideo_.hidden) {
    this.disableVR_();
  }
  // Rotate the div containing the videos -180 deg with a CSS transform.
  this.deactivate_(this.videosDiv_);

  if (!this.remoteVideoResetTimer_) {
    this.remoteVideoResetTimer_ = setTimeout(function() {
      this.remoteVideoResetTimer_ = null;
      trace('Resetting remoteVideo src after transitioning to waiting.');
      this.remoteVideo_.srcObject = null;
    }.bind(this), 800);
  }

  // Set localVideo.srcObject now so that the local stream won't be lost if the
  // call is restarted before the timeout.
  this.localVideo_.srcObject = this.miniVideo_.srcObject;

  // Transition opacity from 0 to 1 for the local video.
  this.activate_(this.localVideo_);
  // Transition opacity from 1 to 0 for the remote and mini videos.
  this.deactivate_(this.remoteVideo_);
  this.deactivate_(this.miniVideo_);
};

AppController.prototype.transitionToDone_ = function() {
  // Stop waiting for remote video.
  this.remoteVideo_.oncanplay = undefined;
  this.deactivate_(this.localVideo_);
  this.deactivate_(this.remoteVideo_);
  this.deactivate_(this.miniVideo_);
  this.hide_(this.hangupSvg_);
  if (this.remoteVideo_.hidden) {
    this.disableVR_();
  }
  this.activate_(this.rejoinDiv_);
  this.show_(this.rejoinDiv_);
  this.displayStatus_('');
};

AppController.prototype.onRejoinClick_ = function() {
  this.deactivate_(this.rejoinDiv_);
  this.hide_(this.rejoinDiv_);
  this.call_.restart();
  this.setupUi_();
};

AppController.prototype.onNewRoomClick_ = function() {
  this.deactivate_(this.rejoinDiv_);
  this.hide_(this.rejoinDiv_);
  this.showRoomSelection_();
};

// Spacebar, or m: toggle audio mute.
// c: toggle camera(video) mute.
// f: toggle fullscreen.
// i: toggle info panel.
// q: quit (hangup)
// Return false to screen out original Chrome shortcuts.
AppController.prototype.onKeyPress_ = function(event) {
  switch (String.fromCharCode(event.charCode)) {
    case ' ':
    case 'm':
      if (this.call_) {
        this.call_.toggleAudioMute();
        this.muteAudioIconSet_.toggle();
      }
      return false;
    case 'c':
      if (this.call_) {
        this.call_.toggleVideoMute();
        this.muteVideoIconSet_.toggle();
      }
      return false;
    case 'f':
      this.toggleFullScreen_();
      return false;
    case 'i':
      this.infoBox_.toggleInfoDiv();
      return false;
    case 'q':
      this.hangup_();
      return false;
    case 'l':
      this.toggleMiniVideo_();
      return false;
    default:
      return;
  }
};

AppController.prototype.pushCallNavigation_ = function(roomId, roomLink) {
  if (!isChromeApp()) {
    window.history.pushState({'roomId': roomId, 'roomLink': roomLink},
                             roomId,
                             roomLink);
  }
};

AppController.prototype.displaySharingInfo_ = function(roomId, roomLink) {
  this.roomLinkHref_.href = roomLink;
  this.roomLinkHref_.text = roomLink;
  this.roomLink_ = roomLink;
  this.pushCallNavigation_(roomId, roomLink);
  this.activate_(this.sharingDiv_);
};

AppController.prototype.displayStatus_ = function(status) {
  if (status === '') {
    this.deactivate_(this.statusDiv_);
  } else {
    this.activate_(this.statusDiv_);
  }
  this.statusDiv_.innerHTML = status;
};

AppController.prototype.displayError_ = function(error) {
  trace(error);
  this.infoBox_.pushErrorMessage(error);
};

AppController.prototype.toggleAudioMute_ = function() {
  this.call_.toggleAudioMute();
  this.muteAudioIconSet_.toggle();
};

AppController.prototype.toggleVideoMute_ = function() {
  this.call_.toggleVideoMute();
  this.muteVideoIconSet_.toggle();
};

AppController.prototype.enableVRToggle_ = function() {
  if (this.remoteVideo_.hidden) {
    this.disableVR_();
  }
  else {
    this.vrActivate_(this.remoteVideo_, this.remoteVideoContainer_);
    if (typeof navigator.getVRDisplays == 'function') {
      this.show_(this.VRControlsSvg);
      document.querySelector('svg#enable-vr title').textContent =
          'Exit VR Camera Mode';
    } else {
      trace('No VR hardware found.');
    }
  }
  this.enableVRIconSet_.toggle();
};

AppController.prototype.disableVR_ = function() {
  if (this.vrEffect_.isPresenting) {
    this.toggleVRControlsDeactivate_();
  }
  this.vrDeactivate_(this.remoteVideo_, this.remoteVideoContainer_);
  this.hide_(this.VRControlsSvg);
  document.querySelector('svg#enable-vr title').textContent =
      'Enter VR Camera Mode';
};

AppController.prototype.toggleVRControls_ = function() {
  if (this.vrEffect_.isPresenting) {
    this.toggleVRControlsDeactivate_();
  }
  else {
    var res = this.vrEffect_.requestPresent();
    var VRIconSet = this.toggleVRControlsIconSet_;
    res.then(function() {
      trace('Entering VR Headset Mode.');
      VRIconSet.toggle();  // Must use global since within promise function
      document.querySelector('svg#vr-controls-toggle title').textContent =
          'Exit VR Headset Mode';
    })
  }
};

AppController.prototype.toggleVRControlsDeactivate_ = function() {
  trace('Exiting VR Headset Mode.');
  this.vrEffect_.exitPresent();
  this.toggleVRControlsIconSet_.toggle();
  document.querySelector('svg#vr-controls-toggle title').textContent =
      'Enter VR Headset Mode';
};

AppController.prototype.toggleFullScreen_ = function() {
  if (isFullScreen()) {
    document.cancelFullScreen();
  } else {
    document.body.requestFullScreen();
  }
};

AppController.prototype.toggleFullScreenButtons_ = function() {
  if (isFullScreen()) {
    trace('Entering fullscreen.');
    document.querySelector('svg#fullscreen title').textContent =
        'Exit fullscreen';
  } else {
    trace('Exiting fullscreen.');
    document.querySelector('svg#fullscreen title').textContent =
        'Enter fullscreen';
  }
  this.fullscreenIconSet_.toggle();
}

AppController.prototype.toggleMiniVideo_ = function() {
  if (this.miniVideo_.classList.contains('active')) {
    this.deactivate_(this.miniVideo_);
  } else {
    this.activate_(this.miniVideo_);
  }
};

AppController.prototype.hide_ = function(element) {
  element.classList.add('hidden');
};

AppController.prototype.show_ = function(element) {
  element.classList.remove('hidden');
};

AppController.prototype.activate_ = function(element) {
  element.classList.add('active');
};

AppController.prototype.vrActivate_ = function(video, videoContainer) {
  trace('Entering VR Camera Mode.');
  video.hidden = true;

  var width = window.innerWidth;
  var height = window.innerHeight;

  // create Camera
  this.vrCamera_ = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
  this.vrCamera_.position.set(0, 0, 0.1);
  if (this.loadingParams_.equirectangular) {
    this.vrCamera_.target = new THREE.Vector3(0, 0, 0);
  }

  // create scene
  this.vrScene_ = new THREE.Scene();

  // video texture
  var texture = new THREE.VideoTexture(video);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.format = THREE.RGBFormat;

  if (this.loadingParams_.equirectangular) {
    var material = new THREE.MeshBasicMaterial({map: texture,
      side: THREE.BackSide,
    });
    var mesh = new THREE.Mesh(this.vrCreateGeometryEquirectangular_(), material);
  }
  else {
    var material = new THREE.MeshBasicMaterial({map: texture});
    var mesh = new THREE.Mesh(this.vrCreateGeometryFisheye_(), material);
  }

  this.vrScene_.add(mesh);

  // create Renderer
  var renderer = new THREE.WebGLRenderer();
  renderer.setClearColor(0x101010);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  videoContainer.appendChild(renderer.domElement);

  // vr effect
  this.vrEffect_ = new THREE.VREffect(renderer);
  this.vrEffect_.scale = 0;
  this.vrEffect_.setSize(width, height);

  // vr controls
  this.controls_ = new THREE.VRControls(this.vrCamera_);

  window.addEventListener('resize', this.vrResize_.bind(this), false);
  this.vrAnimate_();
};

AppController.prototype.vrDeactivate_ = function(video, videoContainer) {
  trace('Exiting VR Camera Mode.');
  video.hidden = false;
  this.vrEffect_.dispose();
  videoContainer.removeChild(videoContainer.childNodes[0]);
};

AppController.prototype.vrCyln2World_ = function(a, e) {
  return (new THREE.Vector3(
    Math.cos(e) * Math.cos(a),
    Math.cos(e) * Math.sin(a),
    Math.sin(e)));
};

AppController.prototype.vrWorld2Fish_ = function(x, y, z) {
  var nz = z;
  if (z < -1.0) nz = -1.0;
  else if (z > 1.0) nz = 1.0;
  return (new THREE.Vector2(
    Math.atan2(y, x),
    Math.acos(nz) / Math.PI)); // 0.0 to 1.0
};

AppController.prototype.vrCalcTexUv_ = function(i, j, lens) {
  var world = this.vrCyln2World_(
    ((i + 90) / 180.0 - 1.0) * Math.PI, // rotate 90 deg for polygon
    (0.5 - j / 180.0) * Math.PI);
  var ar = this.vrWorld2Fish_(
    Math.sin(-0.5 * Math.PI) * world.z + Math.cos(-0.5 * Math.PI) * world.x,
    world.y,
    Math.cos(-0.5 * Math.PI) * world.z - Math.sin(-0.5 * Math.PI) * world.x);

  var fishRad = 0.883;
  var fishRad2 = fishRad * 0.88888888888888;
  var fishCenter = 1.0 - 0.44444444444444;
  var x = (lens === 0) ?
    fishRad * ar.y * Math.cos(ar.x) * 0.5 + 0.25 :
    fishRad * (1.0 - ar.y) * Math.cos(-1.0 * ar.x + Math.PI) * 0.5 + 0.75;
  var y = (lens === 0) ?
    fishRad2 * ar.y * Math.sin(ar.x) + fishCenter :
    fishRad2 * (1.0 - ar.y) * Math.sin(-1.0 * ar.x + Math.PI) + fishCenter;
  return (new THREE.Vector2(x, y));
};

AppController.prototype.vrCreateGeometryEquirectangular_ = function() {
  var geometry = new THREE.Geometry();
  geometry.name = 'equirectangular'
  var uvs = [];
  for (j = 0; j <= 180; j += 5) {
    for (i = 0; i <= 360; i += 5) {
      geometry.vertices.push(new THREE.Vector3(
        Math.sin(Math.PI * j / 180.0) * Math.sin(Math.PI * i / 180.0) * 500.0,
        Math.cos(Math.PI * j / 180.0) * 500.0,
        Math.sin(Math.PI * j / 180.0) * Math.cos(Math.PI * i / 180.0) * 500.0));
    }
    /* divide texture */
    for (k = 0; k <= 180; k += 5) {
      uvs.push(this.vrCalcTexUv_(k, j, 0));
    }
    for (l = 180; l <= 360; l += 5) {
      uvs.push(this.vrCalcTexUv_(l, j, 1));
    }
  }

  for (m = 0; m < 36; m++) {
    for (n = 0; n < 72; n++) {
      var v = m * 73 + n;
      geometry.faces.push(
        new THREE.Face3(v + 0, v + 1, v + 73, null, null, 0),
        new THREE.Face3(v + 1, v + 74, v + 73, null, null, 0));
      var t = (n < 36) ? m * 74 + n : m * 74 + n + 1;

      geometry.faceVertexUvs[0].push(
        [uvs[t + 0], uvs[t + 1], uvs[t + 74]], [uvs[t + 1], uvs[t + 75], uvs[t + 74]]);
    }
  }
  geometry.scale(-1, 1, 1);
  geometry.rotateY(Math.PI);
  return geometry;
};

AppController.prototype.vrCreateGeometryFisheye_ = function() {
  var geometry = new THREE.SphereGeometry(100, 32, 32, 0);
  geometry.name = 'equirectangular'
  geometry.scale(-1, 1, 1);
  var faceVertexUvs = geometry.faceVertexUvs[0];
  for (i = 0; i < faceVertexUvs.length; i++) {
    var uvs = faceVertexUvs[i];
    var face = geometry.faces[i];
    for (var j = 0; j < 3; j++) {
      var x = face.vertexNormals[j].x;
      var y = face.vertexNormals[j].y;
      var z = face.vertexNormals[j].z;

      if (i < faceVertexUvs.length / 2) {
        var correction = (x == 0 && z == 0) ?
            1 :
            (Math.acos(y) / Math.sqrt(x * x + z * z)) * (2 / Math.PI);
        uvs[j].x = x * (423 / 1920) * correction + (480 / 1920);
        uvs[j].y = z * (423 / 1080) * correction + (600 / 1080);

      } else {
        var correction = (x == 0 && z == 0) ?
            1 :
            (Math.acos(-y) / Math.sqrt(x * x + z * z)) * (2 / Math.PI);
        uvs[j].x = -1 * x * (423 / 1920) * correction + (1440 / 1920);
        uvs[j].y = z * (423 / 1080) * correction + (600 / 1080);
      }
    }
  }
  geometry.rotateZ(-Math.PI / 2);
  return geometry
};

AppController.prototype.vrAnimate_ = function() {
  this.vrEffect_.requestAnimationFrame(this.vrAnimate_.bind(this));
  this.vrRender_();
};

AppController.prototype.vrRender_ = function() {
  this.controls_.update();
  this.vrEffect_.render(this.vrScene_, this.vrCamera_);
};

AppController.prototype.vrResize_ = function() {
  var width = window.innerWidth;
  var height = window.innerHeight;

  this.vrCamera_.aspect = width / height;
  this.vrCamera_.updateProjectionMatrix();
  this.vrEffect_.setSize(width, height);
};

AppController.prototype.deactivate_ = function(element) {
  element.classList.remove('active');
};

AppController.prototype.showIcons_ = function() {
  if (!this.icons_.classList.contains('active')) {
    this.activate_(this.icons_);
    this.setIconTimeout_();
  }
};

AppController.prototype.hideIcons_ = function() {
  if (this.icons_.classList.contains('active')) {
    this.deactivate_(this.icons_);
  }
};

AppController.prototype.setIconTimeout_ = function() {
  if (this.hideIconsAfterTimeout) {
    window.clearTimeout.bind(this, this.hideIconsAfterTimeout);
  }
  this.hideIconsAfterTimeout =
    window.setTimeout(function() {
    this.hideIcons_();
  }.bind(this), 5000);
};

AppController.prototype.iconEventSetup_ = function() {
  this.icons_.onmouseenter = function() {
    window.clearTimeout(this.hideIconsAfterTimeout);
  }.bind(this);

  this.icons_.onmouseleave = function() {
    this.setIconTimeout_();
  }.bind(this);
};

AppController.prototype.loadUrlParams_ = function() {
  /* jscs: disable */
  /* jshint ignore:start */
  // Suppressing jshint warns about using urlParams['KEY'] instead of
  // urlParams.KEY, since we'd like to use string literals to avoid the Closure
  // compiler renaming the properties.
  var DEFAULT_VIDEO_CODEC = 'VP9';
  var urlParams = queryStringToDictionary(window.location.search);
  this.loadingParams_.audioSendBitrate = urlParams['asbr'];
  this.loadingParams_.audioSendCodec = urlParams['asc'];
  this.loadingParams_.audioRecvBitrate = urlParams['arbr'];
  this.loadingParams_.audioRecvCodec = urlParams['arc'];
  this.loadingParams_.opusMaxPbr = urlParams['opusmaxpbr'];
  this.loadingParams_.opusFec = urlParams['opusfec'];
  this.loadingParams_.opusDtx = urlParams['opusdtx'];
  this.loadingParams_.opusStereo = urlParams['stereo'];
  this.loadingParams_.videoSendBitrate = urlParams['vsbr'];
  this.loadingParams_.videoSendInitialBitrate = urlParams['vsibr'];
  this.loadingParams_.videoSendCodec = urlParams['vsc'];
  this.loadingParams_.videoRecvBitrate = urlParams['vrbr'];
  this.loadingParams_.videoRecvCodec = urlParams['vrc'] || DEFAULT_VIDEO_CODEC;
  this.loadingParams_.videoFec = urlParams['videofec'];
  this.loadingParams_.equirectangular = urlParams['toggleEquirectangular'];
  /* jshint ignore:end */
  /* jscs: enable */
};

AppController.IconSet_ = function(iconSelector) {
  this.iconElement = document.querySelector(iconSelector);
};

AppController.IconSet_.prototype.toggle = function() {
  if (this.iconElement.classList.contains('on')) {
    this.iconElement.classList.remove('on');
    // turn it off: CSS hides `svg path.on` and displays `svg path.off`
  } else {
    // turn it on: CSS displays `svg.on path.on` and hides `svg.on path.off`
    this.iconElement.classList.add('on');
  }
};
