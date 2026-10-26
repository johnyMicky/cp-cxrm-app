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
  writeBatch,
  arrayRemove,
  increment,
  deleteField,
  Timestamp
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
  async setUserOnline(userId: string, isOnline: boolean) {
    if (!userId || userId === "1") return;
    try {
      // updateDoc (not setDoc+merge) so a deleted user's doc is never recreated.
      await updateDoc(doc(db, USERS_COL, userId), {
        isOnline,
        lastSeen: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to set user status:", err);
    }
  },

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

  async addMembersToChat(chatId: string, userIds: string[]) {
    const cleanIds = [...new Set((userIds || []).filter(Boolean).map(String))];

    if (!chatId) throw new Error("Chat is required");
    if (cleanIds.length === 0) throw new Error("Select at least one user");

    await updateDoc(doc(db, CHATS_COL, chatId), {
      members: arrayUnion(...cleanIds)
    });

    return cleanIds.length;
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
    // Regular chat is participant-private for every role, including Administrator.
    // This prevents an Administrator from accidentally opening a direct chat
    // between two other users and seeing a misleading conversation title.
    const q = query(
      collection(db, CHATS_COL),
      where("members", "array-contains", userId)
    );

    return onSnapshot(q, (snap) => {
      const rawChats = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

      // Old versions could create duplicate direct chats for the same pair.
      // Keep only the most recently active one in the UI without deleting history.
      const directByPair = new Map<string, any>();
      const groups: any[] = [];

      for (const chat of rawChats) {
        if (!chat.isDirect) {
          groups.push(chat);
          continue;
        }

        const pairKey = (chat.members || []).map((id: string) => String(id)).sort().join("__");
        if (!pairKey) continue;

        const existing = directByPair.get(pairKey);
        const chatTime = chat.lastMessageAt?.toMillis?.() || chat.createdAt?.toMillis?.() || 0;
        const existingTime = existing?.lastMessageAt?.toMillis?.() || existing?.createdAt?.toMillis?.() || 0;

        if (!existing || chatTime >= existingTime) {
          directByPair.set(pairKey, chat);
        }
      }

      const chats = [...groups, ...Array.from(directByPair.values())];

      chats.sort((a: any, b: any) => {
        const timeA = a.lastMessageAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const timeB = b.lastMessageAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });

      callback(chats);
    });
  },

  async sendMessage(chatId: string, messageData: any, chatMembers?: string[]) {
    const msgRef = await addDoc(collection(db, CHATS_COL, chatId, MESSAGES_COL), {
      ...messageData,
      createdAt: serverTimestamp(),
      seenBy: [messageData.senderId]
    });

    // Members are needed for per-user unread counters. Use the list passed by
    // the UI when available, otherwise read the chat once.
    let members: string[] = Array.isArray(chatMembers) ? chatMembers : [];
    if (members.length === 0) {
      const chatSnap = await getDoc(doc(db, CHATS_COL, chatId));
      members = Array.isArray(chatSnap.data()?.members) ? chatSnap.data()!.members : [];
    }

    const chatUpdate: any = {
      lastMessage: this.previewTextForMessage(messageData),
      lastMessageAt: serverTimestamp(),
      lastMessageSeenBy: [messageData.senderId],
      lastMessageSenderId: messageData.senderId,
      lastMessageSenderName: messageData.senderName || '',
      lastMessageId: msgRef.id,
      lastMessageType: messageData.type || 'text'
    };

    members
      .map((memberId: any) => String(memberId))
      .filter((memberId: string) => memberId && memberId !== String(messageData.senderId))
      .forEach((memberId: string) => {
        chatUpdate[`unread.${memberId}`] = increment(1);
      });
    chatUpdate[`unread.${messageData.senderId}`] = 0;

    await updateDoc(doc(db, CHATS_COL, chatId), chatUpdate);

    return msgRef;
  },

  // Short text shown in the chat list for the latest message.
  previewTextForMessage(messageData: any) {
    const type = String(messageData?.type || 'text');
    if (type === 'image') return '📷 Photo';
    if (type === 'file') return `📎 ${messageData?.fileName || 'File'}`;
    if (type === 'gif') return 'GIF';
    if (type === 'system') return String(messageData?.text || '');
    return String(messageData?.text || '');
  },

  getMessages(chatId: string, callback: (messages: any[]) => void) {
    const q = query(
      collection(db, CHATS_COL, chatId, MESSAGES_COL),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(q, (snap) => {
      const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

  async uploadFile(file: File, onProgress?: (percent: number) => void) {
    if (!file) {
      throw new Error("No file selected");
    }

    console.log("UPLOAD START");
    console.log("AUTH CURRENT USER:", auth.currentUser);
    console.log("AUTH UID:", auth.currentUser?.uid || null);
    console.log("FILE:", {
      name: file.name,
      size: file.size,
      type: file.type
    });

    if (!auth.currentUser) {
      throw new Error("No authenticated Firebase user found. Please log out and sign in again.");
    }

    const maxSizeMb = 25;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      throw new Error(`File is too large. Maximum allowed size is ${maxSizeMb} MB.`);
    }

    const cleanName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_");

    const extension = cleanName.includes(".") ? cleanName.split(".").pop() : "";
    const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${
      extension ? `.${extension}` : ""
    }`;

    const folder = file.type.startsWith("image/") ? "chat_images" : "chat_files";
    const fullPath = `${folder}/${uniqueName}`;
    const storageRef = ref(storage, fullPath);

    console.log("STORAGE PATH:", fullPath);
    console.log("STORAGE BUCKET:", storage.app.options.storageBucket);

    try {
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: {
          originalName: cleanName,
          uploadedBy: auth.currentUser.uid
        }
      });

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const progress =
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) onProgress(progress);
            console.log("UPLOAD PROGRESS:", progress.toFixed(2) + "%");
            console.log("UPLOAD STATE:", snapshot.state);
          },
          (error) => {
            console.error("FIREBASE STORAGE ERROR CODE:", error?.code);
            console.error("FIREBASE STORAGE ERROR MESSAGE:", error?.message);
            console.error("FIREBASE STORAGE FULL ERROR:", error);
            reject(
              new Error(
                `${error?.code || "upload-error"}: ${error?.message || "Upload failed"}`
              )
            );
          },
          async () => {
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              console.log("UPLOAD SUCCESS URL:", downloadUrl);
              resolve();
            } catch (urlError: any) {
              console.error("DOWNLOAD URL ERROR:", urlError?.code, urlError?.message, urlError);
              reject(new Error(urlError?.message || "Failed to get download URL"));
            }
          }
        );
      });

      return await getDownloadURL(uploadTask.snapshot.ref);
    } catch (error: any) {
      console.error("FINAL UPLOAD ERROR:", error);
      throw new Error(error?.message || "Failed to upload file");
    }
  },

  async setTyping(chatId: string, userId: string, isTyping: boolean) {
    await updateDoc(doc(db, CHATS_COL, chatId), {
      [`typing.${userId}`]: isTyping
    });
  },

  async pinMessage(chatId: string, messageId: string | null) {
    await updateDoc(doc(db, CHATS_COL, chatId), {
      pinnedMessageId: messageId
    });
  },

  async getPinnedMessage(chatId: string, messageId: string) {
    const docSnap = await getDoc(doc(db, CHATS_COL, chatId, MESSAGES_COL, messageId));
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  },

  async searchMessages(chatId: string, searchTerm: string) {
    const q = query(
      collection(db, CHATS_COL, chatId, MESSAGES_COL),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const snap = await getDocs(q);
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
    const cleanSearch = searchTerm.toLowerCase();

    return messages.filter((m: any) =>
      (m.text && m.text.toLowerCase().includes(cleanSearch)) ||
      (m.senderName && m.senderName.toLowerCase().includes(cleanSearch))
    );
  },

  async getAllUsers() {
    const snap = await getDocs(collection(db, USERS_COL));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async getVisibleUsers(currentUserId: string, currentUserRole: string) {
    if (!currentUserId) return [];

    const allUsers = await this.getAllUsers() as any[];
    const currentUser = allUsers.find((user: any) => String(user.id) === String(currentUserId));
    const role = String(currentUser?.role || currentUserRole || 'Agent');
    const teamId = String(currentUser?.teamId || '');

    let visible: any[];

    if (role === 'Administrator' || role === 'Manager') {
      visible = allUsers;
    } else {
      visible = allUsers.filter((user: any) => {
        if (String(user.id) === String(currentUserId)) return true;

        const userRole = String(user.role || 'Agent');
        const sameTeam = !!teamId && String(user.teamId || '') === teamId;

        // Agents and Team Leaders can communicate with their own team
        // plus Managers, as requested.
        return (
          (sameTeam && ['Agent', 'Team Leader'].includes(userRole)) ||
          userRole === 'Manager'
        );
      });
    }

    // Remove legacy duplicate user documents by normalized email where possible.
    const deduped = new Map<string, any>();
    for (const user of visible) {
      const key = String(user.email || user.id || '').trim().toLowerCase();
      if (!key) continue;
      const existing = deduped.get(key);
      if (!existing || String(user.id) === String(currentUserId)) {
        deduped.set(key, user);
      }
    }

    return Array.from(deduped.values()).sort((a: any, b: any) =>
      String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''))
    );
  },

  async findUserByEmail(
    email: string,
    currentUserId?: string,
    currentUserRole?: string
  ) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return null;

    if (currentUserId) {
      const visibleUsers = await this.getVisibleUsers(currentUserId, currentUserRole || 'Agent');
      return (visibleUsers as any[]).find((user: any) =>
        String(user.email || '').trim().toLowerCase() === cleanEmail
      ) || null;
    }

    const q = query(collection(db, USERS_COL), where("email", "==", cleanEmail));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  },

  async searchGifs(searchTerm: string, limitCount = 18) {
    const apiKey = (import.meta as any).env?.VITE_GIPHY_API_KEY || '';
    if (!apiKey) {
      throw new Error('GIF search is not configured. Add VITE_GIPHY_API_KEY in Vercel.');
    }

    const cleanTerm = String(searchTerm || '').trim();
    if (!cleanTerm) {
      return await this.getTrendingGifs(limitCount);
    }

    const params = new URLSearchParams({
      api_key: apiKey,
      q: cleanTerm.slice(0, 50),
      limit: String(limitCount),
      rating: 'pg-13',
      lang: 'en'
    });

    const response = await fetch(`https://api.giphy.com/v1/gifs/search?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`GIF search failed (${response.status})`);
    }

    const body = await response.json();

    return (body?.data || []).map((gif: any) => ({
      id: gif.id,
      title: gif.title || 'GIF',
      url:
        gif.images?.fixed_height?.url ||
        gif.images?.downsized?.url ||
        gif.images?.original?.url ||
        '',
      previewUrl:
        gif.images?.fixed_width_small?.url ||
        gif.images?.fixed_height_small?.url ||
        gif.images?.fixed_height?.url ||
        gif.images?.original?.url ||
        '',
      originalUrl: gif.images?.original?.url || gif.images?.downsized?.url || ''
    })).filter((gif: any) => gif.url);
  },

  async getTrendingGifs(limitCount = 18) {
    const apiKey = (import.meta as any).env?.VITE_GIPHY_API_KEY || '';
    if (!apiKey) {
      throw new Error('GIF search is not configured. Add VITE_GIPHY_API_KEY in Vercel.');
    }

    const params = new URLSearchParams({
      api_key: apiKey,
      limit: String(limitCount),
      rating: 'pg-13'
    });

    const response = await fetch(`https://api.giphy.com/v1/gifs/trending?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`GIF loading failed (${response.status})`);
    }

    const body = await response.json();

    return (body?.data || []).map((gif: any) => ({
      id: gif.id,
      title: gif.title || 'GIF',
      url:
        gif.images?.fixed_height?.url ||
        gif.images?.downsized?.url ||
        gif.images?.original?.url ||
        '',
      previewUrl:
        gif.images?.fixed_width_small?.url ||
        gif.images?.fixed_height_small?.url ||
        gif.images?.fixed_height?.url ||
        gif.images?.original?.url ||
        '',
      originalUrl: gif.images?.original?.url || gif.images?.downsized?.url || ''
    })).filter((gif: any) => gif.url);
  },

  async getOrCreateDirectChat(userId1: string, userId2: string, user2Name: string) {
    if (!userId1 || !userId2 || userId1 === userId2) {
      throw new Error("A direct chat requires two different users");
    }

    // Query only by membership, then filter in memory. This avoids requiring a
    // composite Firestore index and also works with legacy direct-chat records.
    const snap = await getDocs(
      query(collection(db, CHATS_COL), where("members", "array-contains", userId1))
    );

    const matches = snap.docs.filter((d) => {
      const data = d.data() as any;
      return (
        data.isDirect === true &&
        Array.isArray(data.members) &&
        data.members.length === 2 &&
        data.members.includes(userId2)
      );
    });

    if (matches.length > 0) {
      matches.sort((a, b) => {
        const ad = a.data() as any;
        const bd = b.data() as any;
        const at = ad.lastMessageAt?.toMillis?.() || ad.createdAt?.toMillis?.() || 0;
        const bt = bd.lastMessageAt?.toMillis?.() || bd.createdAt?.toMillis?.() || 0;
        return bt - at;
      });

      const existingChat = matches[0];
      const directKey = [userId1, userId2].sort().join("__");

      await updateDoc(existingChat.ref, { directKey });
      return { id: existingChat.id, ...existingChat.data(), directKey };
    }

    // Deterministic document id prevents future duplicate direct chats even if
    // both users start the conversation at the same time.
    const sortedIds = [userId1, userId2].sort();
    const directKey = sortedIds.join("__");
    const directRef = doc(db, CHATS_COL, `direct_${directKey}`);
    const existingDeterministic = await getDoc(directRef);

    if (existingDeterministic.exists()) {
      return { id: existingDeterministic.id, ...existingDeterministic.data() };
    }

    await setDoc(directRef, {
      name: user2Name,
      members: sortedIds,
      isDirect: true,
      directKey,
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      typing: {}
    });

    const newDoc = await getDoc(directRef);
    return { id: newDoc.id, ...newDoc.data() };
  },

  // ===========================================================================
  // Chat v2 features (per-user pin / mute / delete-for-me, unread counters,
  // paginated messages, reactions, edit / delete messages, group management).
  // All fields are additive: older chats and messages keep working unchanged.
  // ===========================================================================

  // Realtime: the latest `pageSize` messages of a chat (oldest first).
  // `hiddenBefore` hides history the user deleted "for me".
  subscribeMessages(
    chatId: string,
    pageSize: number,
    hiddenBefore: any,
    callback: (messages: any[], hasMore: boolean) => void,
    onError?: (error: any) => void
  ) {
    const constraints: any[] = [];
    if (hiddenBefore?.toMillis) {
      constraints.push(where("createdAt", ">", hiddenBefore));
    }
    constraints.push(orderBy("createdAt", "desc"), limit(pageSize + 1));

    const q = query(collection(db, CHATS_COL, chatId, MESSAGES_COL), ...constraints);

    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data({ serverTimestamps: "estimate" })
        } as any));
        const hasMore = docs.length > pageSize;
        const page = docs.slice(0, pageSize).reverse();
        callback(page, hasMore);
      },
      (error) => {
        console.error("Messages listener failed:", error);
        if (onError) onError(error);
      }
    );
  },

  // Marks a chat as read for one user (unread counter + legacy seen flags).
  async markChatRead(chatId: string, userId: string, unseenMessageIds: string[] = []) {
    if (!chatId || !userId) return;
    const batch = writeBatch(db);

    unseenMessageIds.slice(0, 200).forEach((messageId) => {
      batch.update(doc(db, CHATS_COL, chatId, MESSAGES_COL, messageId), {
        seenBy: arrayUnion(userId)
      });
    });

    batch.update(doc(db, CHATS_COL, chatId), {
      [`unread.${userId}`]: 0,
      lastMessageSeenBy: arrayUnion(userId)
    });

    await batch.commit();
  },

  async markChatUnread(chatId: string, userId: string) {
    await updateDoc(doc(db, CHATS_COL, chatId), {
      [`unread.${userId}`]: 1,
      lastMessageSeenBy: arrayRemove(userId)
    });
  },

  async setChatPinned(chatId: string, userId: string, pinned: boolean) {
    await updateDoc(doc(db, CHATS_COL, chatId), {
      pinnedBy: pinned ? arrayUnion(userId) : arrayRemove(userId)
    });
  },

  async setChatMuted(chatId: string, userId: string, muted: boolean) {
    await updateDoc(doc(db, CHATS_COL, chatId), {
      mutedBy: muted ? arrayUnion(userId) : arrayRemove(userId)
    });
  },

  // "Delete for me": hides the chat and its current history only for this
  // user. The other person keeps everything. A new message brings the chat
  // back with only the new messages.
  async hideChatForUser(chatId: string, userId: string) {
    await updateDoc(doc(db, CHATS_COL, chatId), {
      [`hiddenFor.${userId}`]: Timestamp.now(),
      [`unread.${userId}`]: 0,
      pinnedBy: arrayRemove(userId)
    });
  },

  // Message reactions. Keys are short ids so they are safe Firestore fields.
  async toggleReaction(chatId: string, messageId: string, reactionKey: string, userId: string, add: boolean) {
    await updateDoc(doc(db, CHATS_COL, chatId, MESSAGES_COL, messageId), {
      [`reactions.${reactionKey}`]: add ? arrayUnion(userId) : arrayRemove(userId)
    });
  },

  async editMessage(chatId: string, messageId: string, text: string, isLastMessage = false) {
    const cleanText = String(text || '').trim();
    if (!cleanText) throw new Error("Message cannot be empty");

    await updateDoc(doc(db, CHATS_COL, chatId, MESSAGES_COL, messageId), {
      text: cleanText,
      editedAt: serverTimestamp()
    });

    if (isLastMessage) {
      await updateDoc(doc(db, CHATS_COL, chatId), { lastMessage: cleanText });
    }
  },

  // Delete for everyone (sender, or Administrator). The message stays as a
  // "deleted" placeholder so replies and history keep their order.
  async deleteMessage(chatId: string, messageId: string, deletedBy: string, isLastMessage = false) {
    await updateDoc(doc(db, CHATS_COL, chatId, MESSAGES_COL, messageId), {
      deleted: true,
      deletedBy,
      deletedAt: serverTimestamp(),
      text: '',
      fileUrl: deleteField(),
      fileName: deleteField(),
      gifUrl: deleteField(),
      gifPreviewUrl: deleteField(),
      gifOriginalUrl: deleteField(),
      reactions: deleteField()
    });

    const chatUpdate: any = {};
    if (isLastMessage) chatUpdate.lastMessage = 'Message deleted';

    const chatSnap = await getDoc(doc(db, CHATS_COL, chatId));
    if (chatSnap.data()?.pinnedMessageId === messageId) chatUpdate.pinnedMessageId = null;

    if (Object.keys(chatUpdate).length > 0) {
      await updateDoc(doc(db, CHATS_COL, chatId), chatUpdate);
    }
  },

  // Small grey info line inside a group ("Ana added Bob"). Does not change
  // unread counters or the chat list preview.
  async addSystemMessage(chatId: string, text: string, actorId: string) {
    await addDoc(collection(db, CHATS_COL, chatId, MESSAGES_COL), {
      type: 'system',
      text,
      senderId: actorId,
      senderName: '',
      createdAt: serverTimestamp(),
      seenBy: [actorId]
    });
  },

  async createGroup(name: string, createdBy: string, memberIds: string[], creatorName = '') {
    const chat: any = await this.createChat(name, createdBy, memberIds);
    await updateDoc(doc(db, CHATS_COL, chat.id), { admins: [createdBy] });
    await this.addSystemMessage(chat.id, `${creatorName || 'Someone'} created the group`, createdBy).catch(console.error);
    return { ...chat, admins: [createdBy] };
  },

  async renameGroup(chatId: string, name: string, actorId: string, actorName = '') {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error("Group name is required");
    await updateDoc(doc(db, CHATS_COL, chatId), { name: cleanName });
    await this.addSystemMessage(chatId, `${actorName || 'Someone'} renamed the group to "${cleanName}"`, actorId).catch(console.error);
  },

  async addMembersWithNotice(chatId: string, userIds: string[], actorId: string, actorName: string, addedNames: string[]) {
    const count = await this.addMembersToChat(chatId, userIds);
    if (addedNames.length > 0) {
      await this.addSystemMessage(chatId, `${actorName || 'Someone'} added ${addedNames.join(', ')}`, actorId).catch(console.error);
    }
    return count;
  },

  async removeMemberFromChat(chatId: string, userId: string, actorId: string, actorName = '', removedName = '') {
    await updateDoc(doc(db, CHATS_COL, chatId), {
      members: arrayRemove(userId),
      admins: arrayRemove(userId),
      pinnedBy: arrayRemove(userId),
      mutedBy: arrayRemove(userId),
      [`unread.${userId}`]: deleteField()
    });
    await this.addSystemMessage(chatId, `${actorName || 'Someone'} removed ${removedName || 'a member'}`, actorId).catch(console.error);
  },

  async leaveGroup(chatId: string, userId: string, userName = '') {
    await this.addSystemMessage(chatId, `${userName || 'Someone'} left the group`, userId).catch(console.error);
    await updateDoc(doc(db, CHATS_COL, chatId), {
      members: arrayRemove(userId),
      admins: arrayRemove(userId),
      pinnedBy: arrayRemove(userId),
      mutedBy: arrayRemove(userId),
      [`unread.${userId}`]: deleteField()
    });
  },

  async setGroupAdmin(chatId: string, userId: string, isAdmin: boolean) {
    await updateDoc(doc(db, CHATS_COL, chatId), {
      admins: isAdmin ? arrayUnion(userId) : arrayRemove(userId)
    });
  }
};
