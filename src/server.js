import http from 'http'
import { Server } from "socket.io";
import express from 'express'
import cors from 'cors'
import config from './config'
import PeerConnectionManager from './peer'
import RoomManager from './room'
let wrtc = require("wrtc");

const app = express();
app.use(cors());
app.use("/public", express.static(__dirname + "/public"));

const httpServer = http.createServer(app);
const io = new Server(httpServer, config.CORS_CONFIG);

const room = new RoomManager();
const peer = new PeerConnectionManager(room);

io.on("connection", (socket) => {
  socket.on("joinRoom", (data) => {
    try {
      let allUsers = room.getOtherUsersInRoom(data.id, data.roomID);
      io.to(data.id).emit("allUsers", { users: allUsers });
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("senderOffer", async (data) => {
    try {
      room.socketToRoom[data.senderSocketID] = data.roomID;
      let pc = peer.createReceiverPeerConnection(data.senderSocketID, socket, data.roomID);
      console.log(pc)
      await pc.setRemoteDescription(data.sdp);
      let sdp = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(sdp);
      socket.join(data.roomID);
      io.to(data.senderSocketID).emit("getSenderAnswer", { sdp });
    } catch (error) {
      console.error(error);
    }
  });

  socket.on("senderCandidate", async (data) => {
    try {
      let pc = peer.receiverPCs[data.senderSocketID];
      // console.log(pc, data.senderSocketID)
      await pc.addIceCandidate(new wrtc.RTCIceCandidate(data.candidate));
    } catch (error) {
      console.error(error);
    }
  });

  socket.on("receiverOffer", async (data) => {
    try {
      let pc = peer.createSenderPeerConnection(data.receiverSocketID, data.senderSocketID, socket, data.roomID);
      await pc.setRemoteDescription(data.sdp);
      let sdp = await pc.createAnswer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(sdp);
      io.to(data.receiverSocketID).emit("getReceiverAnswer", {
        id: data.senderSocketID,
        sdp,
      });
    } catch (error) {
      console.error(error);
    }
  });

  socket.on("receiverCandidate", async (data) => {
    try {
      const senderPC = peer.senderPCs[data.senderSocketID].filter((sPC) => sPC.id === data.receiverSocketID)[0];
      await senderPC.pc.addIceCandidate(
        new wrtc.RTCIceCandidate(data.candidate)
      );
    } catch (error) {
      console.error(error);
    }
  });

  socket.on("disconnect", () => {
    try {
      let roomID = room.socketToRoom[socket.id];

      room.deleteUser(socket.id, roomID);
      peer.closeReceiverPC(socket.id);
      peer.closeSenderPCs(socket.id);

      socket.broadcast.to(roomID).emit("userExit", { id: socket.id });
    } catch (error) {
      console.error(error);
    }
  });
});

const handleListen = () => console.log('Listen one' + config.SOCKET_SERVER_URL)
httpServer.listen(config.SERVER_PORT, handleListen);