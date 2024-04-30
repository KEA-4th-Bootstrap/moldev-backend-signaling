import config from './config'
import utils from './utils'
let wrtc = require("wrtc");

class PeerConnectionManager {
  constructor(room) {
      this.receiverPCs = {};
      this.senderPCs = {};
      this.room = room;
  }

  joinFirstReceiverPC(socketId, pc) {
    this.receiverPCs = { ...this.receiverPCs, [socketId]: pc };
  }

  joinReceiverPC(socketId, pc) {
    this.receiverPCs[socketId] = pc;
  }

  joinFirstSenderPC(senderSocketId, receiverSocketId, pc) {
    this.senderPCs = {
      ...this.senderPCs,
      [senderSocketId]: [{ id: receiverSocketId, pc }]
    };
  }

  joinSenderPC(senderSocketId, receiverSocketId, pc) {
    this.senderPCs[senderSocketId].filter((user) => user.id !== receiverSocketId);
    this.senderPCs[senderSocketId].push({ id: receiverSocketId, pc });
  }

 createReceiverPeerConnection (socketId, socket, roomId) {
    const pc = new wrtc.RTCPeerConnection(config.PC_CONFIG);
  
    if (this.receiverPCs[socketId]) {
      this.joinReceiverPC(socketId, pc);
    } else { 
      this.joinFirstReceiverPC(socketId, pc);
    }
  
    pc.onicecandidate = (e) => {
      socket.to(socketId).emit("getSenderCandidate", {
        candidate: e.candidate,
      });
    };
  
    pc.oniceconnectionstatechange = (e) => {
      console.log(e);
    };
  
    pc.ontrack = (e) => {
      if (this.room.users[roomId]) {
        if (utils.isIncluded(this.room.users[roomId], socketId)) return;
        this.room.joinSocketRoomWithMediaStream(roomId, socketId, e.streams[0])
      } else {
        this.room.joinFirstSocketRoomWithMediaStream(roomId, socketId, e.streams[0])
      }
      socket.broadcast.to(roomId).emit("userEnter", { id: socketId });
    };
  
    return pc;
  };

  createSenderPeerConnection (receiverSocketId, senderSocketId, socket, roomId) {
    const pc = new wrtc.RTCPeerConnection(config.PC_CONFIG);
  
    if (this.senderPCs[senderSocketId]) {
      this.joinSenderPC(senderSocketId, receiverSocketId, pc);
    } else {
      this.joinFirstSenderPC(senderSocketId, receiverSocketId, pc);
    }
  
    pc.onicecandidate = (e) => {
      socket.to(receiverSocketId).emit("getReceiverCandidate", {
        id: senderSocketId,
        candidate: e.candidate,
      });
    };
  
    pc.oniceconnectionstatechange = (e) => {
      console.log(e);
    };
  
    const sendUser = this.room.getSenderUser(roomId, senderSocketId);
    sendUser.stream.getTracks().forEach((track) => {
      pc.addTrack(track, sendUser.stream);
    });
  
    return pc;
  };

  closeReceiverPC (socketId) {
    if (!receiverPCs[socketId]) return;
  
    receiverPCs[socketId].close();
    delete receiverPCs[socketId];
  };

  closeSenderPCs (socketId) {
    if (!senderPCs[socketId]) return;
  
    senderPCs[socketId].forEach((senderPC) => {
      senderPC.pc.close();
      const eachSenderPC = senderPCs[senderPC.id].filter((sPC) => sPC.id === socketId)[0];

      if (!eachSenderPC) return;

      eachSenderPC.pc.close();
      senderPCs[senderPC.id] = senderPCs[senderPC.id].filter((sPC) => sPC.id !== socketId);
    });
  
    delete senderPCs[socketId];
  };
}

module.exports = PeerConnectionManager;