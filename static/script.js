const socket = io("https://03a2-2405-201-d058-d805-5c49-199d-f44c-f7ca.ngrok-free.app");
const room = "{{ room }}";
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const toggleMic = document.getElementById("toggleMic");
const toggleVideo = document.getElementById("toggleVideo");
const shareScreen = document.getElementById("shareScreen");
const startRecording = document.getElementById("startRecording");
const chatToggle = document.getElementById("chatToggle");
const endCall = document.getElementById("endCall");
const chatbox = document.getElementById("chatbox");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChat = document.getElementById("sendChat");
const localMuteStatus = document.getElementById("localMuteStatus");
const remoteMuteStatus = document.getElementById("remoteMuteStatus");

let localStream;
let peerConnection;
let micEnabled = true;
let videoEnabled = true;
let mediaRecorder;
let recordedChunks = [];

const configuration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const user = "User-" + Math.random().toString(36).substring(2, 8); // Random user ID
socket.emit("join_room", { room, user });

// Access the camera and microphone
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
    localStream = stream;
    localVideo.srcObject = stream;

    peerConnection = new RTCPeerConnection(configuration);

    // Add tracks to the peer connection
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    // Listen for ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("signal", { room, candidate: event.candidate });
        }
    };

    // Listen for remote tracks
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle incoming signals
    socket.on("signal", (data) => {
        if (data.sdp) {
            peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === "offer") {
                peerConnection.createAnswer().then((answer) => {
                    peerConnection.setLocalDescription(answer);
                    socket.emit("signal", { room, sdp: answer });
                });
            }
        } else if (data.candidate) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    });

    // Create an offer to connect
    peerConnection.createOffer().then((offer) => {
        peerConnection.setLocalDescription(offer);
        socket.emit("signal", { room, sdp: offer });
    });
});

// Toggle Mic
toggleMic.addEventListener("click", () => {
    micEnabled = !micEnabled;
    localStream.getAudioTracks()[0].enabled = micEnabled;
    toggleMic.textContent = micEnabled ? "🔇 Mute" : "🔊 Unmute";
    localMuteStatus.textContent = micEnabled ? "🔊" : "🔇";
});

// Toggle Video
toggleVideo.addEventListener("click", () => {
    videoEnabled = !videoEnabled;
    localStream.getVideoTracks()[0].enabled = videoEnabled;
    toggleVideo.textContent = videoEnabled ? "🎥 Video Off" : "📷 Video On";
});

// Share Screen
shareScreen.addEventListener("click", () => {
    navigator.mediaDevices.getDisplayMedia({ video: true }).then((stream) => {
        const screenTrack = stream.getTracks()[0];
        peerConnection.getSenders().find((sender) => sender.track.kind === "video").replaceTrack(screenTrack);
        screenTrack.onended = () => {
            peerConnection.getSenders().find((sender) => sender.track.kind === "video").replaceTrack(localStream.getVideoTracks()[0]);
        };
    });
});

// Start/Stop Screen Recording
startRecording.addEventListener("click", () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
            .then((stream) => {
                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.ondataavailable = (event) => recordedChunks.push(event.data);
                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordedChunks, { type: "video/webm" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.style.display = "none";
                    a.href = url;
                    a.download = "recording.webm";
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                };
                mediaRecorder.start();
                showNotification("Recording started");
            });
    } else if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        showNotification("Recording stopped");
    }
});

// Toggle Chat
chatToggle.addEventListener("click", () => {
    chatbox.classList.toggle("hidden");
});

// End Call
endCall.addEventListener("click", () => {
    peerConnection.close();
    window.location.href = "/";
});

// Chat Functionality
sendChat.addEventListener("click", () => {
    const message = chatInput.value.trim();
    if (message) {
        socket.emit("chat_message", { room, message });
        chatMessages.innerHTML += `<div class="message self">${message}</div>`;
        chatInput.value = "";
    }
});

// Receive chat messages
socket.on("chat_message", (data) => {
    chatMessages.innerHTML += `<div class="message other">${data.message}</div>`;
});

// Show Notification
function showNotification(message) {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.classList.remove("hidden");
    setTimeout(() => {
        notification.classList.add("hidden");
    }, 3000); // Hide after 3 seconds
}

// Handle Join Notifications
socket.on("user_joined", (data) => {
    showNotification(`${data.user} has joined the room.`);
});
