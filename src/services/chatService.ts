import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  arrayUnion, 
  arrayRemove,
  getDocs,
  getDoc,
  limit,
  Timestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import imageCompression from 'browser-image-compression';
import { db, storage } from "../firebase";

const CHATS_COL = "chats";
const MESSAGES_COL = "messages";
const USERS_COL = "users";

export const chatService = {
  // User Status
  async setUserOnline(userId: string, isOnline: boolean) {
    try {
      await updateDoc(doc(db, USERS_COL, userId), { isOnline });
    } catch (err) {
      console.error("Failed to set user status:", err);
    }
  },

  // Chat Groups
  async createChat(name: string, createdBy: string, members: string[]) {
    const chatData = {
      name,
      createdBy,
      members: [...new Set([...members, createdBy])],
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(), // Added for sorting
      typing: {}
    };
    return await addDoc(collection(db, CHATS_COL), chatData);
  },

  async addMemberToChat(chatId: string, email: string) {
    const usersSnap = await getDocs(query(collection(db, USERS_COL), where("email", "==", email)));
    if (usersSnap.empty) throw new Error("User not found");
    const userId = usersSnap.docs[0].id;
    await updateDoc(doc(db, CHATS_COL, chatId), {
      members: arrayUnion(userId)
    });
  },

  getChats(userId: string, role: string, callback: (chats: any[]) => void) {
    let q;
    // Remove server-side orderBy to avoid index requirements and missing field filtering
    if (role === 'Administrator') {
      q = query(collection(db, CHATS_COL));
    } else {
      q = query(collection(db, CHATS_COL), where("members", "array-contains", userId));
    }

    return onSnapshot(q, (snap) => {
      const chats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort client-side instead
      chats.sort((a: any, b: any) => {
        const timeA = a.lastMessageAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const timeB = b.lastMessageAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      callback(chats);
    });
  },

  // Messages
  async sendMessage(chatId: string, messageData: any) {
    const msgRef = await addDoc(collection(db, CHATS_COL, chatId, MESSAGES_COL), {
      ...messageData,
      createdAt: serverTimestamp(),
      seenBy: [messageData.senderId]
    });

    // Update chat document with last message info
    await updateDoc(doc(db, CHATS_COL, chatId), {
      lastMessage: messageData.text || `[${messageData.type}]`,
      lastMessageAt: serverTimestamp(),
      lastMessageSeenBy: [messageData.senderId],
      lastMessageSenderId: messageData.senderId
    });

    return msgRef;
  },

  getMessages(chatId: string, callback: (messages: any[]) => void) {
    const q = query(
      collection(db, CHATS_COL, chatId, MESSAGES_COL), 
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(messages);
    });
  },

  async markAsSeen(chatId: string, messageId: string, userId: string) {
    await updateDoc(doc(db, CHATS_COL, chatId, MESSAGES_COL, messageId), {
      seenBy: arrayUnion(userId)
    });
    // Also update chat-level seen status for the last message
    await updateDoc(doc(db, CHATS_COL, chatId), {
      lastMessageSeenBy: arrayUnion(userId)
    });
  },

  // Files
  async uploadFile(file: File) {
    let fileToUpload = file;

    // Compress if it's an image
    if (file.type.startsWith('image/')) {
      try {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true
        };
        fileToUpload = await imageCompression(file, options);
      } catch (error) {
        console.error("Compression failed, uploading original:", error);
      }
    }

    const storageRef = ref(storage, `chat_files/${Date.now()}_${fileToUpload.name}`);
    await uploadBytes(storageRef, fileToUpload);
    return await getDownloadURL(storageRef);
  },

  // Typing Indicator
  async setTyping(chatId: string, userId: string, isTyping: boolean) {
    await updateDoc(doc(db, CHATS_COL, chatId), {
      [`typing.${userId}`]: isTyping
    });
  },

  // Pinning
  async pinMessage(chatId: string, messageId: string | null) {
    await updateDoc(doc(db, CHATS_COL, chatId), {
      pinnedMessageId: messageId
    });
  },

  async getPinnedMessage(chatId: string, messageId: string) {
    const docSnap = await getDoc(doc(db, CHATS_COL, chatId, MESSAGES_COL, messageId));
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  },

  // Search
  async searchMessages(chatId: string, searchTerm: string) {
    // Firestore doesn't support full-text search well. We'll fetch and filter client-side for simplicity
    // or use a more complex query if needed. For now, client-side.
    const q = query(collection(db, CHATS_COL, chatId, MESSAGES_COL), orderBy("createdAt", "desc"), limit(100));
    const snap = await getDocs(q);
    const messages = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    return messages.filter((m: any) => 
      (m.text && m.text.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.senderName && m.senderName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  },

  // Users
  async getAllUsers() {
    const snap = await getDocs(collection(db, USERS_COL));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async findUserByEmail(email: string) {
    const q = query(collection(db, USERS_COL), where("email", "==", email.toLowerCase()));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  },

  async getOrCreateDirectChat(userId1: string, userId2: string, user2Name: string) {
    // Check if a direct chat already exists
    const q = query(
      collection(db, CHATS_COL), 
      where("members", "array-contains", userId1),
      where("isDirect", "==", true)
    );
    const snap = await getDocs(q);
    const existingChat = snap.docs.find(d => {
      const data = d.data();
      return data.members.includes(userId2) && data.members.length === 2;
    });

    if (existingChat) {
      return { id: existingChat.id, ...existingChat.data() };
    }

    // Create new direct chat
    const docRef = await addDoc(collection(db, CHATS_COL), {
      name: user2Name, 
      members: [userId1, userId2],
      isDirect: true,
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(), // Ensure it has a timestamp for ordering
      typing: {}
    });

    const newDoc = await getDoc(docRef);
    return { id: newDoc.id, ...newDoc.data() };
  }
};
