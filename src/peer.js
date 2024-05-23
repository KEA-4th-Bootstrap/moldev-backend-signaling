class PeerConnectionManager {
  constructor() {
      this.receiverPCs = {};
      this.senderPCs = {};
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

  closeReceiverPC (socketId) {
    if (!this.receiverPCs[socketId]) return;
  
    this.receiverPCs[socketId].close();
    delete this.receiverPCs[socketId];
  };

  closeSenderPCs (socketId) {
    if (!this.senderPCs[socketId]) return;
  
    this.senderPCs[socketId].forEach((senderPC) => {
      senderPC.pc.close();
      const eachSenderPC = this.senderPCs[senderPC.id].filter((sPC) => sPC.id === socketId)[0];

      if (!eachSenderPC) return;

      eachSenderPC.pc.close();
      this.senderPCs[senderPC.id] = this.senderPCs[senderPC.id].filter((sPC) => sPC.id !== socketId);
    });
  
    delete this.senderPCs[socketId];
  };
}

module.exports = PeerConnectionManager;