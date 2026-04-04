import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  arrayUnion,
  getDocs,
  getDoc,
  limit,
  setDoc,
  writeBatch
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL
} from "firebase/storage";
import { db, storage, auth } from "../firebase";

const CHATS_COL = "chats";
const MESSAGES_COL = "messages";
const USERS_COL = "users";

export const chatService = {
  // User Status
  async setUserOnline(userId: string, isOnline: boolean) {
    if (!userId || userId === '1') return;
    try {
      await setDoc(
        doc(db, USERS_COL, userId),
        {
          isOnline,
          lastSeen: serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Failed to set user status:", err);
    }
  },

  // Chat Groups
  async createChat(name: string, createdBy: string, members: string[]) {
    const cleanName = (name || "").trim();
    if (!cleanName) {
      throw new Error("Group name is required");
    }

    const chatData = {
      name: cleanName,
      createdBy,
      members: [...new Set([...(members || []), createdBy])],
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      typing: {}
    };

    const docRef = await addDoc(collection(db, CHATS_COL), chatData);
    const newDoc = await getDoc(docRef);
    return { id: newDoc.id, ...newDoc.data() };
  },

  async addMemberToChat(chatId: string, email: string) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) throw new Error("Email is required");

    const usersSnap = await getDocs(
      query(collection(db, USERS_COL), where("email", "==", cleanEmail))
    );

    if (usersSnap.empty) throw new Error("User not found");

    const userId = usersSnap.docs[0].id;

    await updateDoc(doc(db, CHATS_COL, chatId), {
      members: arrayUnion(userId)
    });
  },

  async deleteChat(chatId: string, currentUserId: string, currentUserRole: string) {
    const chatRef = doc(db, CHATS_COL, chatId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      throw new Error("Chat not found");
    }

    const chatData = chatSnap.data() as any;

    const isAdmin = currentUserRole === "Administrator";
    const isManager = currentUserRole === "Manager";
    const isCreator = chatData.createdBy === currentUserId;

    if (!isAdmin && !isManager && !isCreator) {
      throw new Error("You do not have permission to delete this group");
    }

    if (chatData.isDirect) {
      throw new Error("Direct chats cannot be deleted this way");
    }

    const messagesRef = collection(db, CHATS_COL, chatId, MESSAGES_COL);
    const messagesSnap = await getDocs(messagesRef);

    const messageDocs = messagesSnap.docs;
    const chunkSize = 499;

    for (let i = 0; i < messageDocs.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = messageDocs.slice(i, i + chunkSize);

      chunk.forEach((messageDoc) => {
        batch.delete(messageDoc.ref);
      });

      if (i + chunkSize >= messageDocs.length) {
        batch.delete(chatRef);
      }

      await batch.commit();
    }

    if (messageDocs.length === 0) {
      await deleteDoc(chatRef);
    }
  },

  getChats(userId: string, role: string, callback: (chats: any[]) => void) {
    let q;

    if (role === 'Administrator') {
      q = query(collection(db, CHATS_COL));
    } else {
      q = query(collection(db, CHATS_COL), where("members", "array-contains", userId));
    }

    return onSnapshot(q, (snap) => {
      const chats = snap.docs.map(d => ({ id: d.id, ...d.data() }));

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

    await updateDoc(doc(db, CHATS_COL, chatId), {
      lastMessageSeenBy: arrayUnion(userId)
    });
  },

  // Files
  async uploadFile(file: File) {
    if (!file) {
      throw new Error("No file selected");
    }

    const maxSizeMb = 50;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      throw new Error(`File is too large. Maximum allowed size is ${maxSizeMb} MB.`);
    }

    const cleanName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');

    const extension = cleanName.includes('.') ? cleanName.split('.').pop() : '';
    const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${extension ? `.${extension}` : ''}`;

    const folder = file.type.startsWith('image/') ? 'chat_images' : 'chat_files';
    const storageRef = ref(storage, `${folder}/${uniqueName}`);

    try {
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          originalName: cleanName
        }
      });

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          () => {
            // optional: progress handling later
          },
          (error) => {
            console.error("Firebase resumable upload error:", error);
            reject(error);
          },
          () => resolve()
        );
      });

      return await getDownloadURL(uploadTask.snapshot.ref);
    } catch (error: any) {
      console.error("Firebase upload error:", error);
      throw new Error(error?.message || "Failed to upload file");
    }
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
    const q = query(
      collection(db, CHATS_COL, chatId, MESSAGES_COL),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const snap = await getDocs(q);
    const messages = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const cleanSearch = searchTerm.toLowerCase();

    return messages.filter((m: any) =>
      (m.text && m.text.toLowerCase().includes(cleanSearch)) ||
      (m.senderName && m.senderName.toLowerCase().includes(cleanSearch))
    );
  },

  // Users
  async getAllUsers() {
    const snap = await getDocs(collection(db, USERS_COL));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async findUserByEmail(email: string) {
    const cleanEmail = email.trim().toLowerCase();
    const q = query(collection(db, USERS_COL), where("email", "==", cleanEmail));
    const snap = await getDocs(q);

    if (snap.empty) return null;

    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  },

  async getOrCreateDirectChat(userId1: string, userId2: string, user2Name: string) {
    const q = query(
      collection(db, CHATS_COL),
      where("members", "array-contains", userId1),
      where("isDirect", "==", true)
    );

    const snap = await getDocs(q);
    const existingChat = snap.docs.find(d => {
      const data = d.data() as any;
      return data.members.includes(userId2) && data.members.length === 2;
    });

    if (existingChat) {
      return { id: existingChat.id, ...existingChat.data() };
    }

    const docRef = await addDoc(collection(db, CHATS_COL), {
      name: user2Name,
      members: [userId1, userId2],
      isDirect: true,
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      typing: {}
    });

    const newDoc = await getDoc(docRef);
    return { id: newDoc.id, ...newDoc.data() };
  }
};
