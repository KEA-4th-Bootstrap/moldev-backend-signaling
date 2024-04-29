import http from 'http'
import { Server } from "socket.io";
import express from 'express'

const app = express();
app.set("view engine", "pug");
app.set("views", __dirname + "/views");
app.use("/public", express.static(__dirname + "/public"));
app.get("/", (_, res) => res.render("home"));
app.get("/*", (_, res) => res.redirect("/"))

const httpServer = http.createServer(app);
const io = new Server(httpServer);

let receiverPCs = {};
let senderPCs = {};
let users = {};
let socketToRoom = {};

io.on("connection", (socket) => {
  socket.on("joinRoom", data => {
    try {
        let allUsers = getOtherUsersInRoom(data.id, data.roomID);
        io.to(data.id).emit("allUsers", { users: allUsers });
    } catch (error) {
        console.log(error);
    }
  });

  socket.on("senderOffer", async data => {
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
        console.log(error);
    }
  });

})

const handleListen = () => console.log('Listen one http://localhost:3000,')
httpServer.listen(3000, handleListen);