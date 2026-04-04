import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Image as ImageIcon,
  Paperclip,
  X,
  Search,
  Plus,
  Pin,
  Download,
  UserPlus,
  Check,
  CheckCheck,
  Sparkles,
  FileText,
  ChevronDown,
  Trash2,
  Users,
  MessageCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { chatService } from '../services/chatService';
import { firestoreService } from '../services/firestoreService';
import { GoogleGenAI } from "@google/genai";
import { cn } from '../App';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState<any>(null);
  const [showPhotoModal, setShowPhotoModal] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [isCreatingLead, setIsCreatingLead] = useState<any>(null);
  const [foundUser, setFoundUser] = useState<any>(null);
  const [isSearchingUser, setIsSearchingUser] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string; type: 'image' | 'file' }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);

  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const currentUserId = localStorage.getItem('userId') || '';
  const currentUserRole = localStorage.getItem('userRole') || 'Administrator';
  const userName = localStorage.getItem('userName') || 'User';

  useEffect(() => {
    if (!isOpen || !currentUserId) return;

    const unsubscribe = chatService.getChats(currentUserId, currentUserRole, (data) => {
      setChats(data);

      if (selectedChat?.id) {
        const updatedSelectedChat = data.find((c: any) => c.id === selectedChat.id);
        if (updatedSelectedChat) {
          setSelectedChat(updatedSelectedChat);
        } else {
          setSelectedChat(null);
          setMessages([]);
          setPinnedMessage(null);
          setShowMembersPanel(false);
        }
      }
    });

    chatService.getAllUsers().then(setUsers).catch(console.error);

    return () => {
      unsubscribe();
    };
  }, [isOpen, currentUserId, currentUserRole, selectedChat?.id]);

  useEffect(() => {
    if (!selectedChat || !currentUserId) return;

    const unsubscribe = chatService.getMessages(selectedChat.id, (data) => {
      setMessages(data);

      data.forEach((m) => {
        if (!m.seenBy?.includes(currentUserId)) {
          chatService.markAsSeen(selectedChat.id, m.id, currentUserId).catch(console.error);
        }
      });
    });

    if (selectedChat.pinnedMessageId) {
      chatService
        .getPinnedMessage(selectedChat.id, selectedChat.pinnedMessageId)
        .then(setPinnedMessage)
        .catch(() => setPinnedMessage(null));
    } else {
      setPinnedMessage(null);
    }

    return () => unsubscribe();
  }, [selectedChat, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const canManageGroups =
    currentUserRole === 'Administrator' || currentUserRole === 'Manager';

  const canDeleteSelectedGroup =
    !!selectedChat &&
    !selectedChat.isDirect &&
    (
      currentUserRole === 'Administrator' ||
      currentUserRole === 'Manager' ||
      selectedChat.createdBy === currentUserId
    );

  const selectedChatMembers = useMemo(() => {
    if (!selectedChat?.members?.length) return [];
    return users.filter((u) => selectedChat.members.includes(u.id));
  }, [selectedChat, users]);

  const filteredMemberResults = useMemo(() => {
    const term = memberSearchTerm.trim().toLowerCase();

    const baseUsers = users.filter((u) => {
      if (!selectedChat) return false;
      return !selectedChat.members?.includes(u.id);
    });

    if (!term) return baseUsers.slice(0, 8);

    return baseUsers
      .filter((u) => {
        const name = (u.name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const role = (u.role || '').toLowerCase();
        return name.includes(term) || email.includes(term) || role.includes(term);
      })
      .slice(0, 12);
  }, [users, selectedChat, memberSearchTerm]);

  const filteredVisibleMembers = useMemo(() => {
    const term = memberSearchTerm.trim().toLowerCase();
    if (!term) return selectedChatMembers;

    return selectedChatMembers.filter((u) => {
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const role = (u.role || '').toLowerCase();
      return name.includes(term) || email.includes(term) || role.includes(term);
    });
  }, [selectedChatMembers, memberSearchTerm]);

  const getChatDisplayName = (chat: any) => {
    if (!chat) return 'Chat';

    if (chat.isDirect) {
      const otherMemberId = chat.members?.find((mId: string) => mId !== currentUserId);
      const otherUser = users.find((u) => u.id === otherMemberId);
      if (otherUser) return otherUser.name || otherUser.email || 'Direct Chat';
    }

    return chat.name || 'Unnamed Chat';
  };

  const escapeRegExp = (value: string) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const normalizeMentionKey = (value: string) => {
    return (value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  };

  const mentionCandidates = useMemo(() => {
    if (!selectedChat || selectedChat.isDirect) return [];

    const members = users.filter((u) => selectedChat.members?.includes(u.id));

    const base = members
      .filter((u) => u.id !== currentUserId)
      .map((u) => ({
        id: u.id,
        name: u.name || u.email || 'User',
        email: u.email || '',
        role: u.role || 'Member',
        avatar: u.avatar || '',
        mentionKey: normalizeMentionKey(u.name || u.email?.split('@')[0] || u.email || 'user'),
        isEveryone: false
      }));

    return [
      {
        id: '__everyone__',
        name: 'everyone',
        email: 'Notify everyone in this group',
        role: 'Group',
        avatar: '',
        mentionKey: 'everyone',
        isEveryone: true
      },
      ...base
    ];
  }, [selectedChat, users, currentUserId]);

  const filteredMentionCandidates = useMemo(() => {
    if (!showMentionDropdown) return [];

    const q = mentionQuery.trim().toLowerCase();

    if (!q) return mentionCandidates.slice(0, 8);

    return mentionCandidates.filter((item) => {
      return (
        item.mentionKey.includes(q) ||
        (item.name || '').toLowerCase().includes(q) ||
        (item.email || '').toLowerCase().includes(q)
      );
    }).slice(0, 8);
  }, [mentionCandidates, mentionQuery, showMentionDropdown]);

  const updateMentionState = useCallback((value: string) => {
    if (!selectedChat || selectedChat.isDirect) {
      setShowMentionDropdown(false);
      setMentionQuery('');
      setMentionStartIndex(null);
      return;
    }

    const input = messageInputRef.current;
    const cursorPos = input?.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursorPos);

    const match = beforeCursor.match(/(^|\s)@([a-zA-Z0-9._-]*)$/);

    if (!match) {
      setShowMentionDropdown(false);
      setMentionQuery('');
      setMentionStartIndex(null);
      return;
    }

    const queryPart = match[2] || '';
    const atIndex = beforeCursor.lastIndexOf('@');

    setShowMentionDropdown(true);
    setMentionQuery(queryPart);
    setMentionStartIndex(atIndex);
  }, [selectedChat]);

  const insertMention = (candidate: any) => {
    if (mentionStartIndex === null) return;

    const input = messageInputRef.current;
    const cursorPos = input?.selectionStart ?? newMessage.length;

    const before = newMessage.slice(0, mentionStartIndex);
    const after = newMessage.slice(cursorPos);
    const mentionText = `@${candidate.mentionKey} `;
    const nextValue = `${before}${mentionText}${after}`;

    setNewMessage(nextValue);
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartIndex(null);

    setTimeout(() => {
      if (messageInputRef.current) {
        const pos = (before + mentionText).length;
        messageInputRef.current.focus();
        messageInputRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const extractMentionsFromText = (text: string) => {
    if (!selectedChat || selectedChat.isDirect) {
      return {
        mentions: [],
        mentionAll: false
      };
    }

    const members = users.filter((u) => selectedChat.members?.includes(u.id));
    const mentionAll = /(^|\s)@everyone\b/i.test(text);

    const mentionedIds: string[] = [];

    members.forEach((user) => {
      const possibleKeys = [
        normalizeMentionKey(user.name || ''),
        normalizeMentionKey(user.email || ''),
        normalizeMentionKey((user.email || '').split('@')[0] || '')
      ].filter(Boolean);

      const isMentioned = possibleKeys.some((key) => {
        const regex = new RegExp(`(^|\\s)@${escapeRegExp(key)}\\b`, 'i');
        return regex.test(text);
      });

      if (isMentioned) {
        mentionedIds.push(user.id);
      }
    });

    return {
      mentions: [...new Set(mentionedIds)],
      mentionAll
    };
  };

  const renderMessageText = (text: string) => {
    const parts = text.split(/(\s+)/);

    return (
      <p className="text-sm whitespace-pre-wrap break-words">
        {parts.map((part, index) => {
          if (/^@[a-zA-Z0-9._-]+$/i.test(part)) {
            return (
              <span
                key={index}
                className="inline-block px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-300 font-medium"
              >
                {part}
              </span>
            );
          }

          return <React.Fragment key={index}>{part}</React.Fragment>;
        })}
      </p>
    );
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!newMessage.trim() && pendingFiles.length === 0) || !selectedChat) return;

    const text = newMessage;
    const filesToSend = [...pendingFiles];

    setNewMessage('');
    setPendingFiles([]);
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartIndex(null);
    setIsUploading(true);

    try {
      const uploadPromises = filesToSend.map(async (item) => {
        const url = await chatService.uploadFile(item.file);
        return chatService.sendMessage(selectedChat.id, {
          senderId: currentUserId,
          senderName: userName,
          type: item.type,
          fileUrl: url,
          fileName: item.file.name,
          fileType: item.file.type,
          fileSize: item.file.size
        });
      });

      await Promise.all(uploadPromises);

      if (text.trim()) {
        const { mentions, mentionAll } = extractMentionsFromText(text);

        await chatService.sendMessage(selectedChat.id, {
          text,
          senderId: currentUserId,
          senderName: userName,
          type: 'text',
          mentions,
          mentionAll
        });
      }

      await chatService.setTyping(selectedChat.id, currentUserId, false);
    } catch (err: any) {
      console.error("Failed to send message:", err);
      alert(err.message || "Failed to send message or files");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'image' | 'file'
  ) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0 || !selectedChat) return;

    const newPending = files.map((file) => ({
      file,
      preview: type === 'image' ? URL.createObjectURL(file) : '',
      type
    }));

    setPendingFiles((prev) => [...prev, ...newPending]);
    if (e.target) e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items) as DataTransferItem[];
    const files = Array.from(e.clipboardData.files) as File[];

    let hasFiles = false;

    if (files.length > 0) {
      const newPending = files.map((file) => ({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
        type: (file.type.startsWith('image/') ? 'image' : 'file') as 'image' | 'file'
      }));
      setPendingFiles((prev) => [...prev, ...newPending]);
      hasFiles = true;
    } else {
      items.forEach((item) => {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            const type = file.type.startsWith('image/') ? 'image' : 'file';
            setPendingFiles((prev) => [
              ...prev,
              {
                file,
                preview: type === 'image' ? URL.createObjectURL(file) : '',
                type: type as 'image' | 'file'
              }
            ]);
            hasFiles = true;
          }
        }
      });
    }

    if (hasFiles) e.preventDefault();
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => {
      const newFiles = [...prev];
      if (newFiles[index]?.preview) {
        URL.revokeObjectURL(newFiles[index].preview);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);
    updateMentionState(value);

    if (!isTyping && selectedChat) {
      setIsTyping(true);
      chatService.setTyping(selectedChat.id, currentUserId, true).catch(console.error);

      setTimeout(() => {
        setIsTyping(false);
        chatService.setTyping(selectedChat.id, currentUserId, false).catch(console.error);
      }, 3000);
    }
  };

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);

    if (term.includes('@') && term.includes('.')) {
      setIsSearchingUser(true);
      try {
        const user = await chatService.findUserByEmail(term);
        if (user && user.id !== currentUserId) {
          setFoundUser(user);
        } else {
          setFoundUser(null);
        }
      } catch (err) {
        console.error("User search failed:", err);
        setFoundUser(null);
      } finally {
        setIsSearchingUser(false);
      }
    } else {
      setFoundUser(null);
    }
  };

  const handleStartDirectChat = async (user: any) => {
    try {
      const chat = await chatService.getOrCreateDirectChat(
        currentUserId,
        user.id,
        user.name || user.email
      );
      setSelectedChat(chat);
      setSearchTerm('');
      setFoundUser(null);
      setShowMembersPanel(false);
      setMemberSearchTerm('');
    } catch (err) {
      console.error("Failed to start direct chat:", err);
      alert("Failed to start chat");
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      const createdChat = await chatService.createChat(newGroupName, currentUserId, []);
      setSelectedChat(createdChat);
      setNewGroupName('');
      setIsCreatingGroup(false);
      setShowMembersPanel(false);
    } catch (err: any) {
      console.error("Failed to create group:", err);
      alert(err.message || "Failed to create group");
    }
  };

  const handleAddMember = async () => {
    if (!newMemberEmail.trim() || !selectedChat) return;

    try {
      await chatService.addMemberToChat(selectedChat.id, newMemberEmail);
      setNewMemberEmail('');
      setMemberSearchTerm('');
      setIsAddingMember(false);
    } catch (err: any) {
      alert(err.message || "Failed to add member");
    }
  };

  const handleQuickAddMember = async (user: any) => {
    if (!selectedChat || !user?.email) return;

    try {
      await chatService.addMemberToChat(selectedChat.id, user.email);
      setNewMemberEmail('');
      setMemberSearchTerm('');
      setIsAddingMember(false);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to add member");
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedChat || selectedChat.isDirect) return;

    const confirmed = window.confirm(
      `Delete group "${selectedChat.name}"?\n\nThis will permanently delete the group and all its messages.`
    );

    if (!confirmed) return;

    try {
      setIsDeletingChat(true);
      const deletingChatId = selectedChat.id;

      await chatService.deleteChat(deletingChatId, currentUserId, currentUserRole);

      setSelectedChat(null);
      setMessages([]);
      setPinnedMessage(null);
      setShowMembersPanel(false);
      setPendingFiles((prev) => {
        prev.forEach((item) => {
          if (item.preview) URL.revokeObjectURL(item.preview);
        });
        return [];
      });

      setChats((prev) => prev.filter((chat) => chat.id !== deletingChatId));
    } catch (err: any) {
      console.error("Failed to delete group:", err);
      alert(err.message || "Failed to delete group");
    } finally {
      setIsDeletingChat(false);
    }
  };

  const handleSummarize = async () => {
    if (!messages.length) return;
    setIsSummarizing(true);

    try {
      const ai = new GoogleGenAI({
        apiKey: (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.GEMINI_API_KEY
      });

      const prompt = `Summarize the following chat conversation between team members. Focus on key decisions, action items, and main topics discussed:\n\n${messages
        .map((m) => `${m.senderName}: ${m.text || '[File/Image]'}`)
        .join('\n')}`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });

      setSummary(response.text || 'No summary available.');
    } catch (err) {
      console.error("Summary failed:", err);
      alert("AI Summary failed");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCreateLeadFromMsg = async (msg: any) => {
    const rawText = msg?.text || '';

    setIsCreatingLead({
      first_name: rawText.split(' ')[0] || '',
      last_name: rawText.split(' ').slice(1).join(' ') || '',
      phone: '',
      email: '',
      source: 'Chat',
      status: 'New',
      notes: `Created from chat message: "${rawText}"`
    });
  };

  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await firestoreService.createLead(isCreatingLead);
      setIsCreatingLead(null);
      alert("Lead created successfully");
    } catch (err) {
      console.error("Lead creation failed:", err);
      alert("Failed to create lead");
    }
  };

  const filteredChats = chats.filter((c) =>
    (getChatDisplayName(c) || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110]"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-5xl bg-[#0A0F1C] border-l border-white/10 z-[120] flex flex-col shadow-2xl"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Team Chat</h2>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                    Internal Communication
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div
                className={cn(
                  "w-full md:w-[300px] xl:w-[320px] transition-all duration-300 flex flex-col border-r border-white/5",
                  selectedChat && "hidden md:flex"
                )}
              >
                <div className="p-4 space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search chats or email..."
                      value={searchTerm}
                      onChange={handleSearchChange}
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>

                  {foundUser && (
                    <div className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                            {foundUser.name?.charAt(0).toUpperCase() || foundUser.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{foundUser.name || 'User'}</p>
                            <p className="text-[10px] text-slate-400 truncate">{foundUser.email}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleStartDirectChat(foundUser)}
                          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-lg shadow-blue-500/20"
                          title="Send Message"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {isSearchingUser && (
                    <div className="flex items-center justify-center py-2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}

                  {canManageGroups && (
                    <button
                      onClick={() => setIsCreatingGroup(true)}
                      className="w-full flex items-center justify-center space-x-2 bg-blue-600/10 text-blue-500 border border-blue-500/20 rounded-lg py-2 text-sm font-medium hover:bg-blue-600 hover:text-white transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Group</span>
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1">
                  {filteredChats.map((chat) => {
                    const displayName = getChatDisplayName(chat);

                    return (
                      <button
                        key={chat.id}
                        onClick={() => {
                          setSelectedChat(chat);
                          setShowMembersPanel(false);
                        }}
                        className={cn(
                          "w-full flex items-center space-x-3 p-3 rounded-xl transition-all group",
                          selectedChat?.id === chat.id
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "hover:bg-white/5 text-slate-400"
                        )}
                      >
                        <div className="relative">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold",
                              selectedChat?.id === chat.id ? "bg-white/20" : "bg-white/5"
                            )}
                          >
                            {displayName?.charAt(0)?.toUpperCase() || '?'}
                          </div>

                          {chat.members?.some((mId: string) => users.find((u) => u.id === mId)?.isOnline) && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#0A0F1C] rounded-full" />
                          )}
                        </div>

                        <div className="flex-1 text-left min-w-0">
                          <p
                            className={cn(
                              "text-sm font-semibold truncate",
                              selectedChat?.id === chat.id ? "text-white" : "text-slate-200"
                            )}
                          >
                            {displayName}
                          </p>
                          <p className="text-[10px] opacity-60 truncate">
                            {Object.values(chat.typing || {}).some((v: any) => !!v)
                              ? "Someone is typing..."
                              : (chat.isDirect ? "Direct conversation" : "Click to view messages")}
                          </p>
                        </div>

                        {chat.lastMessage && !chat.lastMessageSeenBy?.includes(currentUserId) && (
                          <div className="w-2 h-2 bg-amber-400 rounded-full shadow-sm shadow-amber-400/50" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                className={cn(
                  "flex-1 flex flex-col bg-black/20",
                  !selectedChat && "hidden md:flex items-center justify-center"
                )}
              >
                {selectedChat ? (
                  <>
                    <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.01]">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setSelectedChat(null)}
                          className="md:hidden p-1 text-slate-400"
                        >
                          <ChevronDown className="w-5 h-5 rotate-90" />
                        </button>

                        <div>
                          <h3 className="text-sm font-bold text-white">
                            {getChatDisplayName(selectedChat)}
                          </h3>
                          <button
                            onClick={() => {
                              setShowMembersPanel((prev) => !prev);
                              setMemberSearchTerm('');
                            }}
                            className="flex items-center space-x-2 text-[10px] text-slate-500 font-medium hover:text-slate-300 transition-colors"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>{selectedChat.members?.length || 0} Members</span>
                            {!selectedChat.isDirect && <Users className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={handleSummarize}
                          disabled={isSummarizing}
                          className="p-2 rounded-lg hover:bg-white/5 text-blue-400 transition-colors"
                          title="AI Summary"
                        >
                          <Sparkles className={cn("w-4 h-4", isSummarizing && "animate-spin")} />
                        </button>

                        {!selectedChat.isDirect && canManageGroups && (
                          <button
                            onClick={() => {
                              setIsAddingMember(true);
                              setMemberSearchTerm('');
                              setNewMemberEmail('');
                            }}
                            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
                            title="Add Member"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                        )}

                        {!selectedChat.isDirect && (
                          <button
                            onClick={() => {
                              setShowMembersPanel((prev) => !prev);
                              setMemberSearchTerm('');
                            }}
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              showMembersPanel
                                ? "bg-white/10 text-white"
                                : "hover:bg-white/5 text-slate-400"
                            )}
                            title="View Members"
                          >
                            <Users className="w-4 h-4" />
                          </button>
                        )}

                        {canDeleteSelectedGroup && (
                          <button
                            onClick={handleDeleteGroup}
                            disabled={isDeletingChat}
                            className="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete Group"
                          >
                            <Trash2 className={cn("w-4 h-4", isDeletingChat && "animate-pulse")} />
                          </button>
                        )}
                      </div>
                    </div>

                    {pinnedMessage && (
                      <div className="p-2 bg-blue-600/10 border-b border-blue-500/20 flex items-center justify-between">
                        <div className="flex items-center space-x-2 min-w-0">
                          <Pin className="w-3 h-3 text-blue-400 flex-shrink-0" />
                          <p className="text-[10px] text-blue-300 truncate">
                            <span className="font-bold mr-1">{pinnedMessage.senderName}:</span>
                            {pinnedMessage.text || "[File]"}
                          </p>
                        </div>
                        <button
                          onClick={() => chatService.pinMessage(selectedChat.id, null)}
                          className="p-1 text-blue-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex-1 flex min-h-0">
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                        {messages.map((msg, i) => {
                          const isMe = msg.senderId === currentUserId;
                          const showAvatar = i === 0 || messages[i - 1].senderId !== msg.senderId;

                          return (
                            <div
                              key={msg.id}
                              className={cn("flex flex-col", isMe ? "items-end" : "items-start")}
                            >
                              {!isMe && showAvatar && (
                                <span className="text-[10px] font-bold text-slate-500 mb-1 ml-1">
                                  {msg.senderName}
                                </span>
                              )}

                              <div
                                className={cn(
                                  "max-w-[85%] rounded-2xl p-3 shadow-sm relative group",
                                  isMe
                                    ? "bg-blue-600 text-white rounded-tr-none"
                                    : "bg-white/5 text-slate-200 rounded-tl-none"
                                )}
                              >
                                {msg.type === 'text' && renderMessageText(msg.text || '')}

                                {msg.type === 'image' && (
                                  <div className="space-y-2">
                                    <img
                                      src={msg.fileUrl}
                                      alt="Chat"
                                      className="rounded-lg max-h-64 cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={() => setShowPhotoModal(msg.fileUrl)}
                                    />
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] opacity-60">{msg.fileName}</span>
                                      <a href={msg.fileUrl} download className="p-1 hover:bg-white/10 rounded">
                                        <Download className="w-3 h-3" />
                                      </a>
                                    </div>
                                  </div>
                                )}

                                {msg.type === 'file' && (
                                  <div className="flex items-center space-x-3 bg-black/20 p-2 rounded-lg border border-white/5">
                                    <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center">
                                      <FileText className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium truncate">{msg.fileName}</p>
                                      <p className="text-[10px] opacity-60">
                                        {(msg.fileSize / 1024).toFixed(1)} KB
                                      </p>
                                    </div>
                                    <a
                                      href={msg.fileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-2 hover:bg-white/10 rounded-lg"
                                    >
                                      <Download className="w-4 h-4" />
                                    </a>
                                  </div>
                                )}

                                <div
                                  className={cn(
                                    "absolute top-0 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 bg-[#0F172A] border border-white/10 rounded-lg p-1 shadow-xl z-10",
                                    isMe ? "right-0" : "left-0"
                                  )}
                                >
                                  <button
                                    onClick={() => chatService.pinMessage(selectedChat.id, msg.id)}
                                    className="p-1 hover:bg-white/5 text-slate-400 hover:text-blue-400 rounded"
                                  >
                                    <Pin className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleCreateLeadFromMsg(msg)}
                                    className="p-1 hover:bg-white/5 text-slate-400 hover:text-emerald-400 rounded"
                                  >
                                    <UserPlus className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="flex items-center justify-end space-x-1 mt-1 opacity-60">
                                  <span className="text-[9px]">
                                    {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'HH:mm') : '...'}
                                  </span>
                                  {isMe &&
                                    (msg.seenBy?.length > 1 ? (
                                      <CheckCheck className="w-3 h-3 text-blue-300" />
                                    ) : (
                                      <Check className="w-3 h-3" />
                                    ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>

                      <AnimatePresence>
                        {showMembersPanel && !selectedChat.isDirect && (
                          <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 320, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            className="hidden lg:flex flex-col border-l border-white/10 bg-white/[0.02] overflow-hidden"
                          >
                            <div className="p-4 border-b border-white/10">
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <h4 className="text-sm font-bold text-white">Group Members</h4>
                                  <p className="text-[11px] text-slate-500">
                                    {selectedChatMembers.length} people in this group
                                  </p>
                                </div>
                                <button
                                  onClick={() => setShowMembersPanel(false)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                  type="text"
                                  placeholder="Search members..."
                                  value={memberSearchTerm}
                                  onChange={(e) => setMemberSearchTerm(e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                />
                              </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                              {filteredVisibleMembers.map((member) => (
                                <div
                                  key={member.id}
                                  className="rounded-xl border border-white/5 bg-black/20 p-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="relative">
                                        {member.avatar ? (
                                          <img
                                            src={member.avatar}
                                            alt={member.name || member.email}
                                            className="w-10 h-10 rounded-full object-cover border border-white/10"
                                          />
                                        ) : (
                                          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                                            {(member.name || member.email || '?').charAt(0).toUpperCase()}
                                          </div>
                                        )}
                                        <span
                                          className={cn(
                                            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0A0F1C]",
                                            member.isOnline ? "bg-emerald-500" : "bg-slate-600"
                                          )}
                                        />
                                      </div>

                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-white truncate">
                                          {member.name || 'Unnamed User'}
                                          {member.id === currentUserId ? ' (You)' : ''}
                                        </p>
                                        <p className="text-[11px] text-slate-500 truncate">
                                          {member.email}
                                        </p>
                                        <p className="text-[10px] text-slate-600 truncate">
                                          {member.role || 'Member'}
                                        </p>
                                      </div>
                                    </div>

                                    {member.id !== currentUserId && (
                                      <button
                                        onClick={() => handleStartDirectChat(member)}
                                        className="p-2 rounded-lg bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white transition-all"
                                        title="Message user"
                                      >
                                        <MessageCircle className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {filteredVisibleMembers.length === 0 && (
                                <div className="text-center text-sm text-slate-500 py-8">
                                  No members found.
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {Object.entries(selectedChat.typing || {}).some(
                      ([uid, typing]) => uid !== currentUserId && typing
                    ) && (
                      <div className="px-4 py-1">
                        <p className="text-[10px] text-slate-500 italic animate-pulse">
                          Someone is typing...
                        </p>
                      </div>
                    )}

                    <div className="p-4 bg-white/[0.02] border-t border-white/10">
                      {pendingFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                          {pendingFiles.map((item, idx) => (
                            <div key={idx} className="relative group">
                              {item.type === 'image' ? (
                                <img
                                  src={item.preview}
                                  className="w-16 h-16 rounded-lg object-cover border border-white/10"
                                  alt="Preview"
                                />
                              ) : (
                                <div className="w-16 h-16 rounded-lg bg-white/5 border border-white/10 flex flex-col items-center justify-center p-1">
                                  <FileText className="w-6 h-6 text-blue-400" />
                                  <span className="text-[8px] text-slate-400 truncate w-full text-center">
                                    {item.file.name}
                                  </span>
                                </div>
                              )}
                              <button
                                onClick={() => removePendingFile(idx)}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <form onSubmit={handleSendMessage} className="flex items-end space-x-2">
                        <div className="flex items-center space-x-1 pb-1">
                          <button
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
                          >
                            <ImageIcon className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
                          >
                            <Paperclip className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="flex-1 relative">
                          {showMentionDropdown && filteredMentionCandidates.length > 0 && (
                            <div className="absolute bottom-[52px] left-0 right-0 z-30 bg-[#0F172A] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                              <div className="max-h-64 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                {filteredMentionCandidates.map((candidate) => (
                                  <button
                                    key={candidate.id}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      insertMention(candidate);
                                    }}
                                    className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/5 transition-colors"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      {candidate.isEveryone ? (
                                        <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-300 flex items-center justify-center font-bold">
                                          @
                                        </div>
                                      ) : candidate.avatar ? (
                                        <img
                                          src={candidate.avatar}
                                          alt={candidate.name}
                                          className="w-9 h-9 rounded-full object-cover border border-white/10"
                                        />
                                      ) : (
                                        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                                          {(candidate.name || candidate.email || '?').charAt(0).toUpperCase()}
                                        </div>
                                      )}

                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-white truncate">
                                          @{candidate.mentionKey}
                                        </p>
                                        <p className="text-[11px] text-slate-500 truncate">
                                          {candidate.isEveryone
                                            ? 'Mention everyone in this group'
                                            : (candidate.name || candidate.email)}
                                        </p>
                                      </div>
                                    </div>

                                    {!candidate.isEveryone && (
                                      <span className="text-[10px] text-slate-600 truncate max-w-[90px]">
                                        {candidate.role}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <input
                            ref={messageInputRef}
                            type="text"
                            placeholder={isUploading ? "Uploading..." : "Type a message..."}
                            value={newMessage}
                            onChange={handleTyping}
                            onPaste={handlePaste}
                            onBlur={() => {
                              setTimeout(() => {
                                setShowMentionDropdown(false);
                              }, 150);
                            }}
                            onFocus={() => updateMentionState(newMessage)}
                            disabled={isUploading}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={(!newMessage.trim() && pendingFiles.length === 0) || isUploading}
                          className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
                        >
                          {isUploading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Send className="w-5 h-5" />
                          )}
                        </button>
                      </form>

                      <input
                        type="file"
                        ref={imageInputRef}
                        className="hidden"
                        accept="image/*"
                        multiple
                        onChange={(e) => handleFileUpload(e, 'image')}
                      />
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        onChange={(e) => handleFileUpload(e, 'file')}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-center p-8">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-8 h-8 text-slate-700" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">Select a Conversation</h3>
                    <p className="text-sm text-slate-500 max-w-[200px] mx-auto">
                      Choose a group from the list to start chatting with your team.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          <AnimatePresence>
            {isCreatingGroup && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
                >
                  <h3 className="text-lg font-bold text-white mb-4">Create New Group</h3>
                  <input
                    type="text"
                    placeholder="Group Name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-4"
                  />
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setIsCreatingGroup(false)}
                      className="flex-1 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateGroup}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-all"
                    >
                      Create
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {isAddingMember && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl"
                >
                  <h3 className="text-lg font-bold text-white mb-4">Add Member</h3>

                  <input
                    type="text"
                    placeholder="Search by name, email or role..."
                    value={memberSearchTerm}
                    onChange={(e) => {
                      setMemberSearchTerm(e.target.value);
                      setNewMemberEmail(e.target.value);
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-3"
                  />

                  <div className="max-h-64 overflow-y-auto custom-scrollbar rounded-xl border border-white/5 bg-black/20 p-2 space-y-2 mb-4">
                    {filteredMemberResults.length > 0 ? (
                      filteredMemberResults.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleQuickAddMember(user)}
                          className="w-full text-left rounded-lg p-3 hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {user.avatar ? (
                                <img
                                  src={user.avatar}
                                  alt={user.name || user.email}
                                  className="w-9 h-9 rounded-full object-cover border border-white/10"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                                  {(user.name || user.email || '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white truncate">
                                  {user.name || 'Unnamed User'}
                                </p>
                                <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                                <p className="text-[10px] text-slate-600 truncate">{user.role || 'Member'}</p>
                              </div>
                            </div>

                            <div className="text-blue-400">
                              <UserPlus className="w-4 h-4" />
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-center text-sm text-slate-500 py-6">
                        No matching users found.
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        setIsAddingMember(false);
                        setMemberSearchTerm('');
                        setNewMemberEmail('');
                      }}
                      className="flex-1 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddMember}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-all"
                    >
                      Add by Email
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {showPhotoModal && (
              <div
                className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
                onClick={() => setShowPhotoModal(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative max-w-4xl w-full"
                >
                  <img
                    src={showPhotoModal}
                    alt="Full size"
                    className="w-full h-auto rounded-xl shadow-2xl"
                  />
                  <button className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </motion.div>
              </div>
            )}

            {summary && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-2xl"
                >
                  <div className="flex items-center space-x-2 mb-4">
                    <Sparkles className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-bold text-white">AI Chat Summary</h3>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 max-h-96 overflow-y-auto custom-scrollbar">
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {summary}
                    </p>
                  </div>
                  <button
                    onClick={() => setSummary(null)}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-all"
                  >
                    Close
                  </button>
                </motion.div>
              </div>
            )}

            {isCreatingLead && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl"
                >
                  <h3 className="text-lg font-bold text-white mb-6">Create Lead from Chat</h3>
                  <form onSubmit={submitLead} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500">
                          First Name
                        </label>
                        <input
                          type="text"
                          value={isCreatingLead.first_name}
                          onChange={(e) =>
                            setIsCreatingLead({ ...isCreatingLead, first_name: e.target.value })
                          }
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500">
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={isCreatingLead.last_name}
                          onChange={(e) =>
                            setIsCreatingLead({ ...isCreatingLead, last_name: e.target.value })
                          }
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Phone</label>
                      <input
                        type="text"
                        value={isCreatingLead.phone}
                        onChange={(e) =>
                          setIsCreatingLead({ ...isCreatingLead, phone: e.target.value })
                        }
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Email</label>
                      <input
                        type="email"
                        value={isCreatingLead.email}
                        onChange={(e) =>
                          setIsCreatingLead({ ...isCreatingLead, email: e.target.value })
                        }
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div className="flex space-x-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setIsCreatingLead(null)}
                        className="flex-1 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-all"
                      >
                        Create Lead
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
