import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Send, 
  Image as ImageIcon, 
  Paperclip, 
  X, 
  Search, 
  Plus, 
  MoreVertical, 
  Pin, 
  Download, 
  Maximize2, 
  UserPlus, 
  Check, 
  CheckCheck, 
  Sparkles, 
  UserCircle,
  Phone,
  UserCheck,
  FileText,
  ExternalLink,
  ChevronDown
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
  const [users, setUsers] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState<any>(null);
  const [showPhotoModal, setShowPhotoModal] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [isCreatingLead, setIsCreatingLead] = useState<any>(null);
  const [foundUser, setFoundUser] = useState<any>(null);
  const [isSearchingUser, setIsSearchingUser] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const currentUserId = localStorage.getItem('userId') || '1';
  const currentUserRole = localStorage.getItem('userRole') || 'Administrator';
  const userName = localStorage.getItem('userName') || 'User';

  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = chatService.getChats(currentUserId, currentUserRole, (data) => {
      setChats(data);
    });

    chatService.getAllUsers().then(setUsers);

    return () => {
      unsubscribe();
    };
  }, [isOpen, currentUserId, currentUserRole]);

  useEffect(() => {
    if (!selectedChat) return;

    const unsubscribe = chatService.getMessages(selectedChat.id, (data) => {
      setMessages(data);
      // Mark as seen
      data.forEach(m => {
        if (!m.seenBy?.includes(currentUserId)) {
          chatService.markAsSeen(selectedChat.id, m.id, currentUserId);
        }
      });
    });

    if (selectedChat.pinnedMessageId) {
      chatService.getPinnedMessage(selectedChat.id, selectedChat.pinnedMessageId).then(setPinnedMessage);
    } else {
      setPinnedMessage(null);
    }

    return () => unsubscribe();
  }, [selectedChat, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;

    const msg = {
      text: newMessage,
      senderId: currentUserId,
      senderName: userName,
      type: 'text'
    };

    setNewMessage('');
    await chatService.sendMessage(selectedChat.id, msg);
    chatService.setTyping(selectedChat.id, currentUserId, false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

    try {
      const url = await chatService.uploadFile(file);
      const msg = {
        senderId: currentUserId,
        senderName: userName,
        type,
        fileUrl: url,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      };
      await chatService.sendMessage(selectedChat.id, msg);
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed");
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file && selectedChat) {
          const url = await chatService.uploadFile(file);
          await chatService.sendMessage(selectedChat.id, {
            senderId: currentUserId,
            senderName: userName,
            type: 'image',
            fileUrl: url,
            fileName: 'pasted_image.png',
            fileType: 'image/png',
            fileSize: file.size
          });
        }
      }
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (!isTyping && selectedChat) {
      setIsTyping(true);
      chatService.setTyping(selectedChat.id, currentUserId, true);
      setTimeout(() => {
        setIsTyping(false);
        chatService.setTyping(selectedChat.id, currentUserId, false);
      }, 3000);
    }
  };

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    
    // If it looks like an email, try to find the user
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
      } finally {
        setIsSearchingUser(false);
      }
    } else {
      setFoundUser(null);
    }
  };

  const handleStartDirectChat = async (user: any) => {
    try {
      const chat = await chatService.getOrCreateDirectChat(currentUserId, user.id, user.name || user.email);
      setSelectedChat(chat);
      setSearchTerm('');
      setFoundUser(null);
    } catch (err) {
      console.error("Failed to start direct chat:", err);
      alert("Failed to start chat");
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    await chatService.createChat(newGroupName, currentUserId, []);
    setNewGroupName('');
    setIsCreatingGroup(false);
  };

  const handleAddMember = async () => {
    if (!newMemberEmail.trim() || !selectedChat) return;
    try {
      await chatService.addMemberToChat(selectedChat.id, newMemberEmail);
      setNewMemberEmail('');
      setIsAddingMember(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSummarize = async () => {
    if (!messages.length) return;
    setIsSummarizing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Summarize the following chat conversation between team members. Focus on key decisions, action items, and main topics discussed: \n\n${messages.map(m => `${m.senderName}: ${m.text || '[File/Image]'}`).join('\n')}`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      setSummary(response.text);
    } catch (err) {
      console.error("Summary failed:", err);
      alert("AI Summary failed");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCreateLeadFromMsg = async (msg: any) => {
    setIsCreatingLead({
      first_name: msg.text.split(' ')[0] || '',
      last_name: msg.text.split(' ').slice(1).join(' ') || '',
      phone: '',
      email: '',
      source: 'Chat',
      status: 'New',
      notes: `Created from chat message: "${msg.text}"`
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
    }
  };

  const filteredChats = chats.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110]"
          />

          {/* Chat Panel */}
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-[#0A0F1C] border-l border-white/10 z-[120] flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Team Chat</h2>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Internal Communication</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Sidebar / Chat List */}
              <div className={cn("w-full transition-all duration-300 flex flex-col border-r border-white/5", selectedChat && "hidden md:flex md:w-1/3")}>
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
                  
                  {/* Found User Section */}
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
                  {(currentUserRole === 'Administrator' || currentUserRole === 'Manager') && (
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
                  {filteredChats.map(chat => {
                    // For direct chats, find the other member's name
                    let displayName = chat.name;
                    if (chat.isDirect) {
                      const otherMemberId = chat.members?.find((mId: string) => mId !== currentUserId);
                      const otherUser = users.find(u => u.id === otherMemberId);
                      if (otherUser) {
                        displayName = otherUser.name || otherUser.email;
                      }
                    }

                    return (
                      <button 
                        key={chat.id}
                        onClick={() => setSelectedChat(chat)}
                        className={cn(
                          "w-full flex items-center space-x-3 p-3 rounded-xl transition-all group",
                          selectedChat?.id === chat.id ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "hover:bg-white/5 text-slate-400"
                        )}
                      >
                        <div className="relative">
                          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold", selectedChat?.id === chat.id ? "bg-white/20" : "bg-white/5")}>
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                          {/* Show online status if it's a 1-on-1 or just show for the group if any member is online */}
                          {chat.members?.some((mId: string) => users.find(u => u.id === mId)?.isOnline) && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#0A0F1C] rounded-full" />
                          )}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className={cn("text-sm font-semibold truncate", selectedChat?.id === chat.id ? "text-white" : "text-slate-200")}>{displayName}</p>
                          <p className="text-[10px] opacity-60 truncate">
                            {Object.values(chat.typing || {}).some(v => v) ? "Someone is typing..." : "Click to view messages"}
                          </p>
                        </div>
                        {/* Simple unread dot if any message in this chat isn't seen by current user */}
                        {/* Note: In a real app, this would be optimized and tracked per chat */}
                        {chat.lastMessage && !chat.lastMessageSeenBy?.includes(currentUserId) && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chat Window */}
              <div className={cn("flex-1 flex flex-col bg-black/20", !selectedChat && "hidden md:flex items-center justify-center")}>
                {selectedChat ? (
                  <>
                    {/* Chat Header */}
                    <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.01]">
                      <div className="flex items-center space-x-3">
                        <button onClick={() => setSelectedChat(null)} className="md:hidden p-1 text-slate-400">
                          <ChevronDown className="w-5 h-5 rotate-90" />
                        </button>
                        <div>
                          <h3 className="text-sm font-bold text-white">{selectedChat.name}</h3>
                          <div className="flex items-center space-x-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] text-slate-500 font-medium">{selectedChat.members?.length || 0} Members</span>
                          </div>
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
                        {(currentUserRole === 'Administrator' || currentUserRole === 'Manager') && (
                          <button 
                            onClick={() => setIsAddingMember(true)}
                            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Pinned Message */}
                    {pinnedMessage && (
                      <div className="p-2 bg-blue-600/10 border-b border-blue-500/20 flex items-center justify-between">
                        <div className="flex items-center space-x-2 min-w-0">
                          <Pin className="w-3 h-3 text-blue-400 flex-shrink-0" />
                          <p className="text-[10px] text-blue-300 truncate">
                            <span className="font-bold mr-1">{pinnedMessage.senderName}:</span>
                            {pinnedMessage.text || "[File]"}
                          </p>
                        </div>
                        <button onClick={() => chatService.pinMessage(selectedChat.id, null)} className="p-1 text-blue-400 hover:text-white">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                      {messages.map((msg, i) => {
                        const isMe = msg.senderId === currentUserId;
                        const showAvatar = i === 0 || messages[i-1].senderId !== msg.senderId;
                        
                        return (
                          <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                            {!isMe && showAvatar && (
                              <span className="text-[10px] font-bold text-slate-500 mb-1 ml-1">{msg.senderName}</span>
                            )}
                            <div className={cn(
                              "max-w-[85%] rounded-2xl p-3 shadow-sm relative group",
                              isMe ? "bg-blue-600 text-white rounded-tr-none" : "bg-white/5 text-slate-200 rounded-tl-none"
                            )}>
                              {/* Message Content */}
                              {msg.type === 'text' && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
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
                                    <p className="text-[10px] opacity-60">{(msg.fileSize / 1024).toFixed(1)} KB</p>
                                  </div>
                                  <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="p-2 hover:bg-white/10 rounded-lg">
                                    <Download className="w-4 h-4" />
                                  </a>
                                </div>
                              )}

                              {/* Message Actions */}
                              <div className={cn(
                                "absolute top-0 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 bg-[#0F172A] border border-white/10 rounded-lg p-1 shadow-xl z-10",
                                isMe ? "right-0" : "left-0"
                              )}>
                                <button onClick={() => chatService.pinMessage(selectedChat.id, msg.id)} className="p-1 hover:bg-white/5 text-slate-400 hover:text-blue-400 rounded">
                                  <Pin className="w-3 h-3" />
                                </button>
                                <button onClick={() => handleCreateLeadFromMsg(msg)} className="p-1 hover:bg-white/5 text-slate-400 hover:text-emerald-400 rounded">
                                  <UserPlus className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Footer (Time & Seen) */}
                              <div className="flex items-center justify-end space-x-1 mt-1 opacity-60">
                                <span className="text-[9px]">
                                  {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'HH:mm') : '...'}
                                </span>
                                {isMe && (
                                  msg.seenBy?.length > 1 ? <CheckCheck className="w-3 h-3 text-blue-300" /> : <Check className="w-3 h-3" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Typing Indicator */}
                    {Object.entries(selectedChat.typing || {}).some(([uid, typing]) => uid !== currentUserId && typing) && (
                      <div className="px-4 py-1">
                        <p className="text-[10px] text-slate-500 italic animate-pulse">Someone is typing...</p>
                      </div>
                    )}

                    {/* Input Area */}
                    <div className="p-4 bg-white/[0.02] border-t border-white/10">
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
                          <input 
                            type="text" 
                            placeholder="Type a message..."
                            value={newMessage}
                            onChange={handleTyping}
                            onPaste={handlePaste}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                        <button 
                          type="submit"
                          disabled={!newMessage.trim()}
                          className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      </form>
                      <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'image')} />
                      <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'file')} />
                    </div>
                  </>
                ) : (
                  <div className="text-center p-8">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-8 h-8 text-slate-700" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">Select a Conversation</h3>
                    <p className="text-sm text-slate-500 max-w-[200px] mx-auto">Choose a group from the list to start chatting with your team.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Modals */}
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
                    <button onClick={() => setIsCreatingGroup(false)} className="flex-1 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">Cancel</button>
                    <button onClick={handleCreateGroup} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-all">Create</button>
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
                  className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
                >
                  <h3 className="text-lg font-bold text-white mb-4">Add Member</h3>
                  <input 
                    type="email" 
                    placeholder="User Email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-4"
                  />
                  <div className="flex space-x-3">
                    <button onClick={() => setIsAddingMember(false)} className="flex-1 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">Cancel</button>
                    <button onClick={handleAddMember} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-all">Add</button>
                  </div>
                </motion.div>
              </div>
            )}

            {showPhotoModal && (
              <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md" onClick={() => setShowPhotoModal(null)}>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative max-w-4xl w-full"
                >
                  <img src={showPhotoModal} alt="Full size" className="w-full h-auto rounded-xl shadow-2xl" />
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
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{summary}</p>
                  </div>
                  <button onClick={() => setSummary(null)} className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-all">Close</button>
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
                        <label className="text-[10px] uppercase font-bold text-slate-500">First Name</label>
                        <input 
                          type="text" 
                          value={isCreatingLead.first_name}
                          onChange={e => setIsCreatingLead({...isCreatingLead, first_name: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Last Name</label>
                        <input 
                          type="text" 
                          value={isCreatingLead.last_name}
                          onChange={e => setIsCreatingLead({...isCreatingLead, last_name: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Phone</label>
                      <input 
                        type="text" 
                        value={isCreatingLead.phone}
                        onChange={e => setIsCreatingLead({...isCreatingLead, phone: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Email</label>
                      <input 
                        type="email" 
                        value={isCreatingLead.email}
                        onChange={e => setIsCreatingLead({...isCreatingLead, email: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div className="flex space-x-3 pt-4">
                      <button type="button" onClick={() => setIsCreatingLead(null)} className="flex-1 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">Cancel</button>
                      <button type="submit" className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-all">Create Lead</button>
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
