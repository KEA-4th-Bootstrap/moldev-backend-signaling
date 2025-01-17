import http from 'http'
import { Server } from "socket.io";
import express from 'express'
import config from './config'
import { Subscribe, Publish, Redis } from './redis'

const app = express();
app.use("/public", express.static(__dirname + "/public"));

const httpServer = http.createServer(app);
const io = new Server(httpServer, config.CORS_CONFIG);

const pub = new Publish();
const redis = new Redis();

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

io.on("connection", async (socket) => {
  const sub = new Subscribe(io, socket);
  
  socket.on("joinRoom", async (data) => {
    const hostId = await redis.getAsync(`room:${data.roomId}`);
    console.log("joinRoom", data.roomId);
    await pub.publish((hostId === null ? socket.id : hostId) + "-joinRoom", JSON.stringify(data));
  });

  socket.on("senderOffer", async (data) => {
    const hostId = await redis.getAsync(`room:${data.roomId}`);
    console.log("senderOffer", data.roomId);
    pub.publish((hostId === null ? socket.id : hostId) + "-senderOffer", JSON.stringify(data));
  });

  socket.on("senderCandidate", async (data) => {
    const hostId = await redis.getAsync(`room:${data.roomId}`);
    console.log("senderCandidate", data.roomId);
    pub.publish((hostId === null ? socket.id : hostId) + "-senderCandidate", JSON.stringify(data));
  });

  socket.on("receiverOffer", async (data) => {
    const hostId = await redis.getAsync(`room:${data.roomId}`);
    console.log("receiverOffer", data.roomId);
    pub.publish((hostId === null ? socket.id : hostId) + "-receiverOffer", JSON.stringify(data));
  });

  socket.on("receiverCandidate", async (data) => {
    const hostId = await redis.getAsync(`room:${data.roomId}`);
    console.log("receiverCandidate", data.roomId);
    pub.publish((hostId === null ? socket.id : hostId) + "-receiverCandidate", JSON.stringify(data));
  });

  socket.on("broadcastCursor", async (data) => {
    const hostId = await redis.getAsync(`room:${data.roomId}`);
    console.log("broadcastCursor", data.roomId);
    pub.publish((hostId === null ? socket.id : hostId) + "-broadcastCursor", JSON.stringify(data));
  });

  socket.on("quitRoom", async (data) => {
    const hostId = await redis.getAsync(`room:${data.roomId}`);
    console.log("quitRoom", data.roomId);
    pub.publish((hostId === null ? socket.id : hostId) + "-disconnect", JSON.stringify(data));
  })

  socket.on("disconnect", async () => {
    pub.publish(socket.id + "-disconnect", JSON.stringify({}));
  });

  await sub.subscribeSendInfoUsingIo(socket.id);
  await sub.subscribeJoinRoom(socket.id);
  await sub.subscribeSenderOffer(socket.id, socket);
  await sub.subscribeSenderCandidate(socket.id);
  await sub.subscribeReceiverOffer(socket.id);
  await sub.subscribeReceiverCandidate(socket.id);
  await sub.subscribeDisconnect(socket.id);
});

const handleListen = () => console.log('Listen one' + config.SOCKET_SERVER_URL)
httpServer.listen(config.SERVER_PORT, handleListen);