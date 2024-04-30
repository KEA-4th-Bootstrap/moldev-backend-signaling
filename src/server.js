import http from 'http'
import { Server } from "socket.io";
import express from 'express'
import cors from 'cors'
let wrtc = require("wrtc");

const app = express();
app.use(cors());
app.use("/public", express.static(__dirname + "/public"));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
      origin: ["http://localhost:3000"],  // 클라이언트 서버의 주소
      methods: ["GET", "POST"],
      transports: ['websocket', 'polling'],
      credentials: true                 // 크레덴셜 허용
  },
  allowEIO3: true
});

let receiverPCs = {};
let senderPCs = {};
let users = {};
let socketToRoom = {};

const pc_config = {
  iceServers: [
    // {
    //   urls: 'stun:[STUN_IP]:[PORT]',
    //   'credentials': '[YOR CREDENTIALS]',
    //   'username': '[USERNAME]'
    // },
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

const isIncluded = (array, id) => array.some((item) => item.id === id);

const createReceiverPeerConnection = (socketID, socket, roomID) => {
  const pc = new wrtc.RTCPeerConnection(pc_config);

  if (receiverPCs[socketID]) receiverPCs[socketID] = pc;
  else receiverPCs = { ...receiverPCs, [socketID]: pc };

  pc.onicecandidate = (e) => {
    console.log(`socketID: ${socketID}'s receiverPeerConnection icecandidate`);
    socket.to(socketID).emit("getSenderCandidate", {
      candidate: e.candidate,
    });
  };

  pc.oniceconnectionstatechange = (e) => {
    console.log(e);
  };

  pc.ontrack = (e) => {
    if (users[roomID]) {
      if (!isIncluded(users[roomID], socketID)) {
        users[roomID].push({
          id: socketID,
          stream: e.streams[0],
        });
      } else return;
    } else {
      users[roomID] = [
        {
          id: socketID,
          stream: e.streams[0],
        },
      ];
    }
    socket.broadcast.to(roomID).emit("userEnter", { id: socketID });
  };

  return pc;
};

const createSenderPeerConnection = (
  receiverSocketID,
  senderSocketID,
  socket,
  roomID
) => {
  const pc = new wrtc.RTCPeerConnection(pc_config);

  if (senderPCs[senderSocketID]) {
    senderPCs[senderSocketID].filter((user) => user.id !== receiverSocketID);
    senderPCs[senderSocketID].push({ id: receiverSocketID, pc });
  } else
    senderPCs = {
      ...senderPCs,
      [senderSocketID]: [{ id: receiverSocketID, pc }],
    };

  pc.onicecandidate = (e) => {
    console.log(`socketID: ${receiverSocketID}'s senderPeerConnection icecandidate`);
    socket.to(receiverSocketID).emit("getReceiverCandidate", {
      id: senderSocketID,
      candidate: e.candidate,
    });
  };

  pc.oniceconnectionstatechange = (e) => {
    console.log(e);
  };

  const sendUser = users[roomID].filter(
    (user) => user.id === senderSocketID
  )[0];
  sendUser.stream.getTracks().forEach((track) => {
    pc.addTrack(track, sendUser.stream);
  });

  return pc;
};

const getOtherUsersInRoom = (socketID, roomID) => {
  let allUsers = [];

  if (!users[roomID]) return allUsers;

  allUsers = users[roomID]
    .filter((user) => user.id !== socketID)
    .map((otherUser) => ({ id: otherUser.id }));

  return allUsers;
};

const deleteUser = (socketID, roomID) => {
  if (!users[roomID]) return;
  users[roomID] = users[roomID].filter((user) => user.id !== socketID);
  if (users[roomID].length === 0) {
    delete users[roomID];
  }
  delete socketToRoom[socketID];
};

const closeReceiverPC = (socketID) => {
  if (!receiverPCs[socketID]) return;

  receiverPCs[socketID].close();
  delete receiverPCs[socketID];
};

const closeSenderPCs = (socketID) => {
  if (!senderPCs[socketID]) return;

  senderPCs[socketID].forEach((senderPC) => {
    senderPC.pc.close();
    const eachSenderPC = senderPCs[senderPC.id].filter(
      (sPC) => sPC.id === socketID
    )[0];
    if (!eachSenderPC) return;
    eachSenderPC.pc.close();
    senderPCs[senderPC.id] = senderPCs[senderPC.id].filter(
      (sPC) => sPC.id !== socketID
    );
  });

  delete senderPCs[socketID];
};

io.on("connection", (socket) => {
  socket.on("joinRoom", (data) => {
    try {
      let allUsers = getOtherUsersInRoom(data.id, data.roomID);
      io.to(data.id).emit("allUsers", { users: allUsers });
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("senderOffer", async (data) => {
    try {
      socketToRoom[data.senderSocketID] = data.roomID;
      let pc = createReceiverPeerConnection(
        data.senderSocketID,
        socket,
        data.roomID
      );
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
      let pc = receiverPCs[data.senderSocketID];
      await pc.addIceCandidate(new wrtc.RTCIceCandidate(data.candidate));
    } catch (error) {
      console.error(error);
    }
  });

  socket.on("receiverOffer", async (data) => {
    try {
      let pc = createSenderPeerConnection(
        data.receiverSocketID,
        data.senderSocketID,
        socket,
        data.roomID
      );
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
      const senderPC = senderPCs[data.senderSocketID].filter((sPC) => sPC.id === data.receiverSocketID)[0];
      await senderPC.pc.addIceCandidate(
        new wrtc.RTCIceCandidate(data.candidate)
      );
    } catch (error) {
      console.error(error);
    }
  });

  socket.on("disconnect", () => {
    try {
      let roomID = socketToRoom[socket.id];

      deleteUser(socket.id, roomID);
      closeReceiverPC(socket.id);
      closeSenderPCs(socket.id);

      socket.broadcast.to(roomID).emit("userExit", { id: socket.id });
    } catch (error) {
      console.error(error);
    }
  });
});

const handleListen = () => console.log('Listen one http://localhost:8080,')
httpServer.listen(8080, handleListen);