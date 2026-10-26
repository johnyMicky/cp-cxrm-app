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
  PinOff,
  Download,
  UserPlus,
  Check,
  CheckCheck,
  Sparkles,
  FileText,
  ChevronDown,
  ChevronLeft,
  Trash2,
  Users,
  MessageCircle,
  MoreHorizontal,
  BellOff,
  Bell,
  Reply,
  Pencil,
  Copy,
  SmilePlus,
  LogOut,
  Shield,
  ShieldOff,
  UserMinus,
  Info,
  SquarePen,
  MailOpen,
  Mail,
  UploadCloud,
  ArrowDown
} from 'lucide-react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { chatService } from '../services/chatService';
import { firestoreService } from '../services/firestoreService';
import { GoogleGenAI } from "@google/genai";
import { cn } from '../App';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  standalone?: boolean;
}

type PendingFile = { file: File; preview: string; type: 'image' | 'file' };
type ListTab = 'all' | 'unread' | 'groups' | 'direct';

const MAX_FILE_MB = 25;
const PAGE_SIZE = 50;

const REACTIONS: { key: string; emoji: string }[] = [
  { key: 'like', emoji: '👍' },
  { key: 'love', emoji: '❤️' },
  { key: 'laugh', emoji: '😂' },
  { key: 'wow', emoji: '😮' },
  { key: 'sad', emoji: '😢' },
  { key: 'fire', emoji: '🔥' }
];
const REACTION_EMOJI: Record<string, string> = Object.fromEntries(REACTIONS.map((r) => [r.key, r.emoji]));

const GROUP_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-fuchsia-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600'
];

const toJsDate = (value: any): Date | null => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatListTime = (value: any) => {
  const date = toJsDate(value);
  if (!date) return '';
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'dd.MM.yy');
};

const formatDayLabel = (date: Date) => {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, d MMMM yyyy');
};

const formatFileSize = (bytes: number) => {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / 1024).toFixed(1)} KB`;
};

const initialsOf = (value: string) => {
  const parts = String(value || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
};

const gradientFor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GROUP_GRADIENTS[hash % GROUP_GRADIENTS.length];
};

function Avatar({
  src,
  name,
  seed,
  size = 40,
  online,
  square = false
}: {
  src?: string;
  name: string;
  seed?: string;
  size?: number;
  online?: boolean;
  square?: boolean;
}) {
  const radius = square ? 'rounded-xl' : 'rounded-full';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt={name} className={`w-full h-full object-cover ${radius} border border-white/10`} />
      ) : (
        <div
          className={`w-full h-full ${radius} bg-gradient-to-br ${gradientFor(seed || name)} flex items-center justify-center text-white font-semibold`}
          style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}
        >
          {initialsOf(name)}
        </div>
      )}
      {online !== undefined && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[#0A0F1C]',
            online ? 'bg-emerald-500' : 'bg-slate-600'
          )}
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
        />
      )}
    </div>
  );
}

export default function ChatPanel({ isOpen, onClose, standalone = false }: ChatPanelProps) {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [pendingSelectedChat, setPendingSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [listTab, setListTab] = useState<ListTab>('all');
  const [users, setUsers] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState<any>(null);
  const [showPhotoModal, setShowPhotoModal] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [isCreatingLead, setIsCreatingLead] = useState<any>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearchTerm, setGifSearchTerm] = useState('');
  const [gifResults, setGifResults] = useState<any[]>([]);
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);

  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);

  // Panels, menus and dialogs
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [chatMenu, setChatMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);
  const [messageMenu, setMessageMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);

  const [groupDialog, setGroupDialog] = useState<null | { name: string; selectedIds: string[]; search: string }>(null);
  const [isCreatingGroupBusy, setIsCreatingGroupBusy] = useState(false);
  const [newDirectDialog, setNewDirectDialog] = useState<null | { search: string }>(null);
  const [addMembersDialog, setAddMembersDialog] = useState<null | { selectedIds: string[]; search: string }>(null);
  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [infoMemberSearch, setInfoMemberSearch] = useState('');

  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [chatSearchResults, setChatSearchResults] = useState<any[] | null>(null);
  const [isSearchingChat, setIsSearchingChat] = useState(false);

  const [dragActive, setDragActive] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const dragCounterRef = useRef(0);
  const lastMessageIdRef = useRef<string | null>(null);
  const prependScrollRef = useRef<{ height: number; top: number } | null>(null);
  const forceScrollBottomRef = useRef(false);
  const markReadKeyRef = useRef('');
  const openedFromUrlRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUserId = localStorage.getItem('userId') || '';
  const currentUserRole = localStorage.getItem('userRole') || 'Administrator';
  const userName = localStorage.getItem('userName') || 'User';

  const emojiOptions = [
    '😀','😃','😄','😁','😂','🤣','😊','😍',
    '😘','😎','🤔','😅','🙄','😴','😭','😡',
    '👍','👎','👏','🙌','🙏','💪','👌','🤝',
    '❤️','🔥','🎉','✅','❌','💯','🚀','👀',
    '😈','🤦','🤷','🥳','😇','😜','🤩','🫡'
  ];

  const showToast = (text: string) => {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  };

  // -------------------------------------------------------------------------
  // Derived chat helpers
  // -------------------------------------------------------------------------
  const selectedChat = useMemo(() => {
    if (!selectedChatId) return null;
    return chats.find((c) => c.id === selectedChatId) || (pendingSelectedChat?.id === selectedChatId ? pendingSelectedChat : null);
  }, [chats, selectedChatId, pendingSelectedChat]);

  const userById = useMemo(() => {
    const map = new Map<string, any>();
    users.forEach((u) => map.set(String(u.id), u));
    return map;
  }, [users]);

  const hiddenAtFor = (chat: any) => chat?.hiddenFor?.[currentUserId] || null;

  const isChatHidden = (chat: any) => {
    const hiddenAt = toJsDate(hiddenAtFor(chat));
    if (!hiddenAt) return false;
    const last = toJsDate(chat.lastMessageAt);
    return !last || last.getTime() <= hiddenAt.getTime();
  };

  const isPinned = (chat: any) => Array.isArray(chat?.pinnedBy) && chat.pinnedBy.includes(currentUserId);
  const isMuted = (chat: any) => Array.isArray(chat?.mutedBy) && chat.mutedBy.includes(currentUserId);

  const unreadCountFor = (chat: any) => {
    if (!chat) return 0;
    const counter = chat.unread?.[currentUserId];
    if (typeof counter === 'number') return Math.max(0, counter);
    // Older chats (before unread counters): fall back to the seen flag.
    return chat.lastMessage &&
      chat.lastMessageSenderId !== currentUserId &&
      !chat.lastMessageSeenBy?.includes(currentUserId)
      ? 1
      : 0;
  };

  const otherMemberOf = (chat: any) => {
    const otherId = chat?.members?.find((mId: string) => mId !== currentUserId);
    return otherId ? userById.get(String(otherId)) || null : null;
  };

  const getChatDisplayName = (chat: any) => {
    if (!chat) return 'Chat';

    if (chat.isDirect) {
      const otherUser = otherMemberOf(chat);
      if (otherUser) return otherUser.name || otherUser.email || 'Direct Chat';
    }

    return chat.name || 'Unnamed Chat';
  };

  const isGroupAdmin = (chat: any, userId: string) =>
    !!chat && (chat.createdBy === userId || (Array.isArray(chat.admins) && chat.admins.includes(userId)));

  const canManageGroup = (chat: any) =>
    !!chat &&
    !chat.isDirect &&
    (currentUserRole === 'Administrator' || currentUserRole === 'Manager' || isGroupAdmin(chat, currentUserId));

  const canDeleteGroup = (chat: any) =>
    !!chat &&
    !chat.isDirect &&
    (currentUserRole === 'Administrator' || currentUserRole === 'Manager' || chat.createdBy === currentUserId);

  const canManageSelectedGroup = canManageGroup(selectedChat);
  const canDeleteSelectedGroup = canDeleteGroup(selectedChat);

  const typingNames = (chat: any) =>
    Object.entries(chat?.typing || {})
      .filter(([uid, typing]) => uid !== currentUserId && !!typing)
      .map(([uid]) => (userById.get(String(uid))?.name || 'Someone').split(' ')[0]);

  // -------------------------------------------------------------------------
  // Data subscriptions
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !currentUserId) return;

    const unsubscribe = chatService.getChats(currentUserId, currentUserRole, (data) => {
      setChats(data);
    });

    chatService.getVisibleUsers(currentUserId, currentUserRole).then(setUsers).catch(console.error);

    return () => {
      unsubscribe();
    };
  }, [isOpen, currentUserId, currentUserRole]);

  // If the selected chat disappears (deleted / removed from it), close it.
  useEffect(() => {
    if (!selectedChatId) return;
    const exists = chats.some((c) => c.id === selectedChatId);
    if (!exists && pendingSelectedChat?.id !== selectedChatId && chats.length > 0) {
      closeConversation();
    }
    if (exists && pendingSelectedChat?.id === selectedChatId) {
      setPendingSelectedChat(null);
    }
  }, [chats, selectedChatId]);

  // Standalone window: open the chat passed as ?chat=<id> once.
  useEffect(() => {
    if (!standalone || openedFromUrlRef.current || chats.length === 0) return;
    const wanted = new URLSearchParams(window.location.search).get('chat');
    if (!wanted) {
      openedFromUrlRef.current = true;
      return;
    }
    const chat = chats.find((c) => c.id === wanted);
    if (chat) {
      openedFromUrlRef.current = true;
      openChat(chat);
    }
  }, [standalone, chats]);

  const selectedHiddenAt = selectedChat ? hiddenAtFor(selectedChat) : null;
  const selectedHiddenKey = selectedHiddenAt?.toMillis ? selectedHiddenAt.toMillis() : 0;

  useEffect(() => {
    if (!selectedChatId || !currentUserId) return;

    const chatForFilter = selectedChat;
    const unsubscribe = chatService.subscribeMessages(
      selectedChatId,
      pageSize,
      selectedHiddenAt,
      (data, hasMore) => {
        // A direct conversation must only contain messages from its two members.
        // This also protects the UI from legacy/corrupt records that were written
        // into the wrong direct chat.
        const safeMessages = chatForFilter?.isDirect
          ? data.filter((m: any) => m.type === 'system' || chatForFilter.members?.includes(m.senderId))
          : data;

        setMessages(safeMessages);
        setHasMoreMessages(hasMore);
        setIsLoadingOlder(false);
      },
      () => setIsLoadingOlder(false)
    );

    return () => unsubscribe();
  }, [selectedChatId, pageSize, selectedHiddenKey, currentUserId]);

  // Pinned message bar.
  useEffect(() => {
    if (!selectedChat) {
      setPinnedMessage(null);
      return;
    }

    if (selectedChat.pinnedMessageId) {
      chatService
        .getPinnedMessage(selectedChat.id, selectedChat.pinnedMessageId)
        .then((msg: any) => setPinnedMessage(msg && !msg.deleted ? msg : null))
        .catch(() => setPinnedMessage(null));
    } else {
      setPinnedMessage(null);
    }
  }, [selectedChat?.id, selectedChat?.pinnedMessageId]);

  // Mark as read while the conversation is open and visible.
  useEffect(() => {
    if (!selectedChat || !currentUserId) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    const unseenIds = messages
      .filter((m: any) => m.type !== 'system' && !m.deleted && !m.seenBy?.includes(currentUserId))
      .map((m: any) => m.id);

    const needsCounterReset = unreadCountFor(selectedChat) > 0;
    if (unseenIds.length === 0 && !needsCounterReset) return;

    const key = `${selectedChat.id}|${unseenIds.join(',')}|${needsCounterReset}`;
    if (markReadKeyRef.current === key) return;
    markReadKeyRef.current = key;

    chatService.markChatRead(selectedChat.id, currentUserId, unseenIds).catch(console.error);
  }, [messages, selectedChat?.id, selectedChat?.unread?.[currentUserId], selectedChat?.lastMessageId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') markReadKeyRef.current = '';
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Scrolling: keep position when older messages load; follow new ones.
  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;

    if (prependScrollRef.current) {
      const { height, top } = prependScrollRef.current;
      container.scrollTop = container.scrollHeight - height + top;
      prependScrollRef.current = null;
      return;
    }

    const last = messages[messages.length - 1];
    const lastId = last?.id || null;
    const isNewLast = lastId !== lastMessageIdRef.current;
    lastMessageIdRef.current = lastId;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < 160;

    if (forceScrollBottomRef.current || (isNewLast && (nearBottom || last?.senderId === currentUserId))) {
      forceScrollBottomRef.current = false;
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      });
    } else if (isNewLast && !nearBottom) {
      setShowJumpToBottom(true);
    }
  }, [messages]);

  const handleMessagesScroll = () => {
    const container = messagesScrollRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 160 && showJumpToBottom) setShowJumpToBottom(false);

    if (container.scrollTop < 80 && hasMoreMessages && !isLoadingOlder) {
      loadOlderMessages();
    }
  };

  const loadOlderMessages = () => {
    const container = messagesScrollRef.current;
    if (!container || !hasMoreMessages || isLoadingOlder) return;
    prependScrollRef.current = { height: container.scrollHeight, top: container.scrollTop };
    setIsLoadingOlder(true);
    setPageSize((size) => size + PAGE_SIZE);
  };

  const jumpToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowJumpToBottom(false);
  };

  // Close floating menus on Escape / outside click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setChatMenu(null);
        setMessageMenu(null);
        setReactionPickerFor(null);
      }
    };
    const onClick = () => {
      setChatMenu(null);
      setMessageMenu(null);
      setReactionPickerFor(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, []);

  // Auto-size the message box.
  useEffect(() => {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [newMessage, selectedChatId]);

  // -------------------------------------------------------------------------
  // Open / close conversation
  // -------------------------------------------------------------------------
  const resetComposerState = () => {
    setReplyingTo(null);
    setEditingMessage(null);
    setShowEmojiPicker(false);
    setShowGifPicker(false);
    setShowMentionDropdown(false);
    setChatSearchOpen(false);
    setChatSearchTerm('');
    setChatSearchResults(null);
    setShowJumpToBottom(false);
    setRenameValue(null);
    setInfoMemberSearch('');
  };

  const openChat = (chat: any) => {
    if (!chat) return;
    if (chat.id !== selectedChatId) {
      setMessages([]);
      setHasMoreMessages(false);
      setPageSize(PAGE_SIZE);
      lastMessageIdRef.current = null;
      markReadKeyRef.current = '';
      forceScrollBottomRef.current = true;
      resetComposerState();
    }
    if (!chats.some((c) => c.id === chat.id)) setPendingSelectedChat(chat);
    setSelectedChatId(chat.id);
    setTimeout(() => messageInputRef.current?.focus(), 50);
  };

  function closeConversation() {
    setSelectedChatId(null);
    setPendingSelectedChat(null);
    setMessages([]);
    setPinnedMessage(null);
    setShowInfoPanel(false);
    resetComposerState();
  }

  // -------------------------------------------------------------------------
  // Members / mentions (unchanged behaviour)
  // -------------------------------------------------------------------------
  const selectedChatMembers = useMemo(() => {
    if (!selectedChat?.members?.length) return [];
    return users.filter((u) => selectedChat.members.includes(u.id));
  }, [selectedChat, users]);

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
      <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
        {parts.map((part, index) => {
          if (/^@[a-zA-Z0-9._-]+$/i.test(part)) {
            return (
              <span
                key={index}
                className="inline-block px-1 rounded-md bg-blue-500/20 text-blue-200 font-medium"
              >
                {part}
              </span>
            );
          }

          if (/^https?:\/\/\S+$/i.test(part)) {
            return (
              <a key={index} href={part} target="_blank" rel="noreferrer" className="underline underline-offset-2 opacity-90 hover:opacity-100 break-all">
                {part}
              </a>
            );
          }

          return <React.Fragment key={index}>{part}</React.Fragment>;
        })}
      </p>
    );
  };

  // -------------------------------------------------------------------------
  // Replies
  // -------------------------------------------------------------------------
  const getReplySenderName = (msg: any) => {
    return (
      userById.get(String(msg?.senderId))?.name ||
      msg?.senderName ||
      'User'
    );
  };

  const getReplyPreviewText = (msg: any) => {
    if (!msg) return '';
    if (msg.deleted) return 'Message deleted';
    if (msg.type === 'gif') return 'GIF';
    if (msg.type === 'image') return `Photo${msg.fileName ? ` · ${msg.fileName}` : ''}`;
    if (msg.type === 'file') return `File${msg.fileName ? ` · ${msg.fileName}` : ''}`;
    return String(msg.text || '').slice(0, 140);
  };

  const buildReplyPayload = () => {
    if (!replyingTo) return {};

    return {
      replyTo: {
        messageId: replyingTo.id,
        senderId: replyingTo.senderId || '',
        senderName: getReplySenderName(replyingTo),
        type: replyingTo.type || 'text',
        text: replyingTo.text || '',
        fileUrl: replyingTo.fileUrl || '',
        fileName: replyingTo.fileName || '',
        gifUrl: replyingTo.gifUrl || ''
      }
    };
  };

  const handleReplyToMessage = (msg: any) => {
    setEditingMessage(null);
    setReplyingTo(msg);
    setShowEmojiPicker(false);
    setShowGifPicker(false);

    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 0);
  };

  const scrollToRepliedMessage = (messageId: string) => {
    if (!messageId) return;
    const element = document.getElementById(`chat-message-${messageId}`);
    if (!element) {
      showToast('This message is older — scroll up to load earlier messages.');
      return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.add('ring-2', 'ring-blue-500/50');
    setTimeout(() => {
      element.classList.remove('ring-2', 'ring-blue-500/50');
    }, 1400);
  };

  // -------------------------------------------------------------------------
  // Emoji / GIF (unchanged behaviour)
  // -------------------------------------------------------------------------
  const handleEmojiSelect = (emoji: string) => {
    const input = messageInputRef.current;
    const cursorPos = input?.selectionStart ?? newMessage.length;
    const before = newMessage.slice(0, cursorPos);
    const after = newMessage.slice(cursorPos);
    const nextValue = `${before}${emoji}${after}`;

    setNewMessage(nextValue);
    setShowEmojiPicker(false);

    setTimeout(() => {
      if (messageInputRef.current) {
        const nextPos = before.length + emoji.length;
        messageInputRef.current.focus();
        messageInputRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 0);
  };

  const loadGifs = async (term = '') => {
    setIsLoadingGifs(true);
    setGifError(null);

    try {
      const results = term.trim()
        ? await chatService.searchGifs(term, 18)
        : await chatService.getTrendingGifs(18);

      setGifResults(results);
    } catch (err: any) {
      console.error('GIF load failed:', err);
      setGifResults([]);
      setGifError(err?.message || 'Failed to load GIFs');
    } finally {
      setIsLoadingGifs(false);
    }
  };

  const handleToggleGifPicker = () => {
    const next = !showGifPicker;
    setShowGifPicker(next);
    setShowEmojiPicker(false);

    if (next && gifResults.length === 0) {
      loadGifs(gifSearchTerm);
    }
  };

  const handleGifSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadGifs(gifSearchTerm);
  };

  const handleSendGif = async (gif: any) => {
    if (!selectedChat || !gif?.url) return;

    try {
      forceScrollBottomRef.current = true;
      await chatService.sendMessage(selectedChat.id, {
        senderId: currentUserId,
        senderName: userName,
        type: 'gif',
        gifUrl: gif.url,
        gifPreviewUrl: gif.previewUrl || gif.url,
        gifOriginalUrl: gif.originalUrl || gif.url,
        gifTitle: gif.title || 'GIF',
        ...buildReplyPayload()
      }, selectedChat.members);

      setReplyingTo(null);
      setShowGifPicker(false);
      setGifSearchTerm('');
    } catch (err: any) {
      console.error('Failed to send GIF:', err);
      alert(err?.message || 'Failed to send GIF');
    }
  };

  // -------------------------------------------------------------------------
  // Sending, editing, files
  // -------------------------------------------------------------------------
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedChat) return;

    // Editing an existing message.
    if (editingMessage) {
      const text = newMessage.trim();
      if (!text) return;
      try {
        await chatService.editMessage(
          selectedChat.id,
          editingMessage.id,
          text,
          selectedChat.lastMessageId === editingMessage.id
        );
        setEditingMessage(null);
        setNewMessage('');
      } catch (err: any) {
        alert(err?.message || 'Failed to edit message');
      }
      return;
    }

    if (!newMessage.trim() && pendingFiles.length === 0) return;

    const text = newMessage;
    const filesToSend = [...pendingFiles];
    const replyPayload = buildReplyPayload();
    const members = selectedChat.members;

    setNewMessage('');
    setPendingFiles([]);
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartIndex(null);
    setIsUploading(filesToSend.length > 0);
    setUploadProgress(filesToSend.map(() => 0));
    forceScrollBottomRef.current = true;

    try {
      const uploadPromises = filesToSend.map(async (item, index) => {
        const url = await chatService.uploadFile(item.file, (percent) => {
          setUploadProgress((prev) => {
            const next = [...prev];
            next[index] = percent;
            return next;
          });
        });
        if (item.preview) URL.revokeObjectURL(item.preview);
        return chatService.sendMessage(selectedChat.id, {
          senderId: currentUserId,
          senderName: userName,
          type: item.type,
          fileUrl: url,
          fileName: item.file.name,
          fileType: item.file.type,
          fileSize: item.file.size,
          ...(!text.trim() && index === 0 ? replyPayload : {})
        }, members);
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
          mentionAll,
          ...replyPayload
        }, members);
      }

      setReplyingTo(null);
      await chatService.setTyping(selectedChat.id, currentUserId, false);
    } catch (err: any) {
      console.error("Failed to send message:", err);
      alert(err.message || "Failed to send message or files");
    } finally {
      setIsUploading(false);
      setUploadProgress([]);
    }
  };

  const addFiles = (files: File[]) => {
    if (!selectedChat || files.length === 0) return;

    const tooBig = files.filter((file) => file.size > MAX_FILE_MB * 1024 * 1024);
    const accepted = files.filter((file) => file.size <= MAX_FILE_MB * 1024 * 1024);

    if (tooBig.length > 0) {
      alert(`These files are larger than ${MAX_FILE_MB} MB and were skipped:\n\n${tooBig.map((f) => `• ${f.name} (${formatFileSize(f.size)})`).join('\n')}`);
    }

    const newPending: PendingFile[] = accepted.map((file) => {
      const isImage = file.type.startsWith('image/');
      return {
        file,
        preview: isImage ? URL.createObjectURL(file) : '',
        type: isImage ? 'image' : 'file'
      };
    });

    if (newPending.length > 0) {
      setPendingFiles((prev) => [...prev, ...newPending]);
      setEditingMessage(null);
      setTimeout(() => messageInputRef.current?.focus(), 0);
    }
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    _type: 'image' | 'file'
  ) => {
    const files = Array.from(e.target.files || []) as File[];
    addFiles(files);
    if (e.target) e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files || []) as File[];

    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
      return;
    }

    const items = Array.from(e.clipboardData.items || []) as DataTransferItem[];
    const fromItems = items
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];

    if (fromItems.length > 0) {
      e.preventDefault();
      addFiles(fromItems);
    }
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

  // Drag & drop anywhere on the conversation.
  const hasFilesInDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types || []).includes('Files');

  const handleDragEnter = (e: React.DragEvent) => {
    if (!selectedChat || !hasFilesInDrag(e)) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!selectedChat || !hasFilesInDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!selectedChat || !hasFilesInDrag(e)) return;
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!selectedChat) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer?.files || []) as File[];
    addFiles(files);
  };

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewMessage(value);
    updateMentionState(value);

    if (!isTyping && selectedChat && !editingMessage) {
      setIsTyping(true);
      chatService.setTyping(selectedChat.id, currentUserId, true).catch(console.error);

      const chatId = selectedChat.id;
      setTimeout(() => {
        setIsTyping(false);
        chatService.setTyping(chatId, currentUserId, false).catch(console.error);
      }, 3000);
    }
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionDropdown && filteredMentionCandidates.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      insertMention(filteredMentionCandidates[0]);
      return;
    }

    if (e.key === 'Escape') {
      if (editingMessage) {
        setEditingMessage(null);
        setNewMessage('');
      } else if (replyingTo) {
        setReplyingTo(null);
      }
      return;
    }

    if (e.key === 'ArrowUp' && !newMessage && !editingMessage) {
      const lastOwn = [...messages].reverse().find((m: any) => m.senderId === currentUserId && m.type === 'text' && !m.deleted);
      if (lastOwn) {
        e.preventDefault();
        startEditMessage(lastOwn);
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // -------------------------------------------------------------------------
  // Message actions
  // -------------------------------------------------------------------------
  const canDeleteMessage = (msg: any) =>
    !msg.deleted && msg.type !== 'system' && (msg.senderId === currentUserId || currentUserRole === 'Administrator');

  const canEditMessage = (msg: any) =>
    !msg.deleted && msg.type === 'text' && msg.senderId === currentUserId;

  const startEditMessage = (msg: any) => {
    setReplyingTo(null);
    setPendingFiles([]);
    setEditingMessage(msg);
    setNewMessage(msg.text || '');
    setTimeout(() => {
      const el = messageInputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  };

  const handleDeleteMessage = async (msg: any) => {
    if (!selectedChat || !canDeleteMessage(msg)) return;
    if (!window.confirm('Delete this message for everyone?')) return;
    try {
      await chatService.deleteMessage(selectedChat.id, msg.id, currentUserId, selectedChat.lastMessageId === msg.id);
      if (editingMessage?.id === msg.id) {
        setEditingMessage(null);
        setNewMessage('');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to delete message');
    }
  };

  const handleCopyMessage = async (msg: any) => {
    try {
      await navigator.clipboard.writeText(msg.text || msg.fileUrl || msg.gifUrl || '');
      showToast('Copied');
    } catch {
      showToast('Copy failed');
    }
  };

  const handleToggleReaction = async (msg: any, reactionKey: string) => {
    if (!selectedChat || msg.deleted) return;
    const already = Array.isArray(msg.reactions?.[reactionKey]) && msg.reactions[reactionKey].includes(currentUserId);
    setReactionPickerFor(null);
    try {
      await chatService.toggleReaction(selectedChat.id, msg.id, reactionKey, currentUserId, !already);
    } catch (err: any) {
      console.error('Reaction failed:', err);
    }
  };

  const handlePinMessage = async (msg: any) => {
    if (!selectedChat) return;
    try {
      await chatService.pinMessage(selectedChat.id, msg.id);
      showToast('Message pinned');
    } catch (err: any) {
      alert(err?.message || 'Failed to pin message');
    }
  };

  // -------------------------------------------------------------------------
  // Chat-level actions (pin / mute / read / delete / leave)
  // -------------------------------------------------------------------------
  const handleTogglePinChat = async (chat: any) => {
    try {
      const next = !isPinned(chat);
      const pinnedCount = chats.filter((c) => isPinned(c)).length;
      if (next && pinnedCount >= 10) {
        showToast('You can pin up to 10 chats');
        return;
      }
      await chatService.setChatPinned(chat.id, currentUserId, next);
      showToast(next ? 'Chat pinned' : 'Chat unpinned');
    } catch (err: any) {
      alert(err?.message || 'Failed to update chat');
    }
  };

  const handleToggleMuteChat = async (chat: any) => {
    try {
      const next = !isMuted(chat);
      await chatService.setChatMuted(chat.id, currentUserId, next);
      showToast(next ? 'Notifications muted' : 'Notifications on');
    } catch (err: any) {
      alert(err?.message || 'Failed to update chat');
    }
  };

  const handleToggleReadChat = async (chat: any) => {
    try {
      if (unreadCountFor(chat) > 0) {
        await chatService.markChatRead(chat.id, currentUserId, []);
      } else {
        if (chat.id === selectedChatId) closeConversation();
        await chatService.markChatUnread(chat.id, currentUserId);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to update chat');
    }
  };

  const handleDeleteDirectForMe = async (chat: any) => {
    const name = getChatDisplayName(chat);
    if (!window.confirm(`Delete the chat with ${name}?\n\nIt will be removed only for you. ${name} will still see the conversation.`)) return;
    try {
      if (chat.id === selectedChatId) closeConversation();
      await chatService.hideChatForUser(chat.id, currentUserId);
      showToast('Chat deleted');
    } catch (err: any) {
      alert(err?.message || 'Failed to delete chat');
    }
  };

  const handleLeaveGroup = async (chat: any) => {
    if (!window.confirm(`Leave the group "${chat.name}"?`)) return;
    try {
      if (chat.id === selectedChatId) closeConversation();
      await chatService.leaveGroup(chat.id, currentUserId, userName);
      showToast('You left the group');
    } catch (err: any) {
      alert(err?.message || 'Failed to leave group');
    }
  };

  const handleDeleteGroup = async (chatArg?: any) => {
    const chat = chatArg || selectedChat;
    if (!chat || chat.isDirect || !canDeleteGroup(chat)) return;

    const confirmed = window.confirm(
      `Delete group "${chat.name}"?\n\nThis will permanently delete the group and all its messages for everyone.`
    );

    if (!confirmed) return;

    try {
      setIsDeletingChat(true);
      const deletingChatId = chat.id;

      await chatService.deleteChat(deletingChatId, currentUserId, currentUserRole);

      if (deletingChatId === selectedChatId) {
        closeConversation();
        setPendingFiles((prev) => {
          prev.forEach((item) => {
            if (item.preview) URL.revokeObjectURL(item.preview);
          });
          return [];
        });
      }

      setChats((prev) => prev.filter((c) => c.id !== deletingChatId));
    } catch (err: any) {
      console.error("Failed to delete group:", err);
      alert(err.message || "Failed to delete group");
    } finally {
      setIsDeletingChat(false);
    }
  };

  // -------------------------------------------------------------------------
  // Direct chats & groups
  // -------------------------------------------------------------------------
  const handleStartDirectChat = async (user: any) => {
    try {
      const chat = await chatService.getOrCreateDirectChat(
        currentUserId,
        user.id,
        user.name || user.email
      );
      setSearchTerm('');
      setNewDirectDialog(null);
      openChat(chat);
    } catch (err) {
      console.error("Failed to start direct chat:", err);
      alert("Failed to start chat");
    }
  };

  const teamsInScope = useMemo(() => {
    const map = new Map<string, { name: string; ids: string[] }>();
    users.forEach((u) => {
      if (u.id === currentUserId) return;
      const name = String(u.teamName || '').trim();
      if (!name) return;
      if (!map.has(name)) map.set(name, { name, ids: [] });
      map.get(name)!.ids.push(u.id);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [users, currentUserId]);

  const filterUsers = (list: any[], term: string) => {
    const t = term.trim().toLowerCase();
    if (!t) return list;
    return list.filter((u) =>
      [u.name, u.email, u.role, u.teamName].some((v) => String(v || '').toLowerCase().includes(t))
    );
  };

  const handleCreateGroup = async () => {
    if (!groupDialog || !groupDialog.name.trim()) return;

    try {
      setIsCreatingGroupBusy(true);
      const createdChat = await chatService.createGroup(
        groupDialog.name,
        currentUserId,
        groupDialog.selectedIds,
        userName
      );
      setGroupDialog(null);
      openChat(createdChat);
    } catch (err: any) {
      console.error("Failed to create group:", err);
      alert(err.message || "Failed to create group");
    } finally {
      setIsCreatingGroupBusy(false);
    }
  };

  const handleAddSelectedMembers = async () => {
    if (!selectedChat || !addMembersDialog || addMembersDialog.selectedIds.length === 0) return;

    try {
      const names = addMembersDialog.selectedIds.map((id) => userById.get(id)?.name || 'a member');
      await chatService.addMembersWithNotice(selectedChat.id, addMembersDialog.selectedIds, currentUserId, userName, names);
      setAddMembersDialog(null);
      showToast('Members added');
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to add members");
    }
  };

  const handleRemoveMember = async (member: any) => {
    if (!selectedChat) return;
    if (!window.confirm(`Remove ${member.name || member.email} from "${selectedChat.name}"?`)) return;
    try {
      await chatService.removeMemberFromChat(selectedChat.id, member.id, currentUserId, userName, member.name || member.email);
    } catch (err: any) {
      alert(err?.message || 'Failed to remove member');
    }
  };

  const handleToggleGroupAdmin = async (member: any) => {
    if (!selectedChat) return;
    const next = !(Array.isArray(selectedChat.admins) && selectedChat.admins.includes(member.id));
    try {
      await chatService.setGroupAdmin(selectedChat.id, member.id, next);
      showToast(next ? `${member.name || 'Member'} is now a group admin` : 'Admin rights removed');
    } catch (err: any) {
      alert(err?.message || 'Failed to update admin');
    }
  };

  const handleRenameGroup = async () => {
    if (!selectedChat || renameValue === null) return;
    const value = renameValue.trim();
    if (!value || value === selectedChat.name) {
      setRenameValue(null);
      return;
    }
    try {
      await chatService.renameGroup(selectedChat.id, value, currentUserId, userName);
      setRenameValue(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to rename group');
    }
  };

  // -------------------------------------------------------------------------
  // AI summary, lead from message, search in chat (unchanged behaviour)
  // -------------------------------------------------------------------------
  const handleSummarize = async () => {
    if (!messages.length) return;
    setIsSummarizing(true);

    try {
      const ai = new GoogleGenAI({
        apiKey: (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.GEMINI_API_KEY
      });

      const prompt = `Summarize the following chat conversation between team members. Focus on key decisions, action items, and main topics discussed:\n\n${messages
        .filter((m) => m.type !== 'system' && !m.deleted)
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

  const handleChatSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !chatSearchTerm.trim()) return;
    setIsSearchingChat(true);
    try {
      const results = await chatService.searchMessages(selectedChat.id, chatSearchTerm.trim());
      setChatSearchResults(results.filter((m: any) => !m.deleted && m.type !== 'system'));
    } catch (err) {
      console.error('Chat search failed:', err);
      setChatSearchResults([]);
    } finally {
      setIsSearchingChat(false);
    }
  };

  // -------------------------------------------------------------------------
  // Chat list
  // -------------------------------------------------------------------------
  const visibleChats = useMemo(() => chats.filter((c) => !isChatHidden(c)), [chats, currentUserId]);

  const totalUnread = useMemo(
    () => visibleChats.reduce((sum, c) => sum + (isMuted(c) ? 0 : unreadCountFor(c)), 0),
    [visibleChats]
  );

  const tabCounts = useMemo(() => ({
    all: visibleChats.length,
    unread: visibleChats.filter((c) => unreadCountFor(c) > 0).length,
    groups: visibleChats.filter((c) => !c.isDirect).length,
    direct: visibleChats.filter((c) => c.isDirect).length
  }), [visibleChats]);

  const listChats = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return visibleChats.filter((c) => {
      if (listTab === 'unread' && unreadCountFor(c) === 0) return false;
      if (listTab === 'groups' && c.isDirect) return false;
      if (listTab === 'direct' && !c.isDirect) return false;
      if (term && !getChatDisplayName(c).toLowerCase().includes(term)) return false;
      return true;
    });
  }, [visibleChats, listTab, searchTerm, userById]);

  const pinnedChats = listChats.filter((c) => isPinned(c));
  const otherChats = listChats.filter((c) => !isPinned(c));

  const peopleResults = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return [];
    return filterUsers(users.filter((u) => u.id !== currentUserId), term).slice(0, 8);
  }, [users, currentUserId, searchTerm]);

  const lastMessagePreview = (chat: any) => {
    const typing = typingNames(chat);
    if (typing.length > 0) {
      return <span className="text-emerald-400">{typing.length === 1 ? `${typing[0]} is typing…` : 'Several people are typing…'}</span>;
    }
    if (!chat.lastMessage) {
      return <span className="text-slate-600">{chat.isDirect ? 'Say hello 👋' : 'No messages yet'}</span>;
    }
    const mine = chat.lastMessageSenderId === currentUserId;
    const senderFirst = !chat.isDirect && !mine
      ? (userById.get(String(chat.lastMessageSenderId))?.name || chat.lastMessageSenderName || '').split(' ')[0]
      : '';
    return (
      <>
        {mine && <span className="text-slate-500">You: </span>}
        {senderFirst && <span className="text-slate-400">{senderFirst}: </span>}
        {String(chat.lastMessage).startsWith('[') && String(chat.lastMessage).endsWith(']')
          ? (chat.lastMessage === '[image]' ? '📷 Photo' : chat.lastMessage === '[file]' ? '📎 File' : chat.lastMessage === '[gif]' ? 'GIF' : chat.lastMessage)
          : chat.lastMessage}
      </>
    );
  };

  const openChatMenu = (e: React.MouseEvent, chat: any) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 240);
    const y = Math.min(e.clientY, window.innerHeight - 300);
    setMessageMenu(null);
    setChatMenu({ chatId: chat.id, x, y });
  };

  const renderChatRow = (chat: any) => {
    const displayName = getChatDisplayName(chat);
    const active = selectedChatId === chat.id;
    const unread = unreadCountFor(chat);
    const muted = isMuted(chat);
    const other = chat.isDirect ? otherMemberOf(chat) : null;

    return (
      <div
        key={chat.id}
        role="button"
        tabIndex={0}
        onClick={() => openChat(chat)}
        onKeyDown={(e) => { if (e.key === 'Enter') openChat(chat); }}
        onContextMenu={(e) => openChatMenu(e, chat)}
        className={cn(
          'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors select-none',
          active ? 'bg-blue-600/15 ring-1 ring-blue-500/30' : 'hover:bg-white/[0.04]'
        )}
      >
        <Avatar
          src={chat.isDirect ? other?.avatar : ''}
          name={displayName}
          seed={chat.id}
          size={44}
          online={chat.isDirect ? !!other?.isOnline : undefined}
          square={!chat.isDirect}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={cn('text-sm truncate', unread > 0 ? 'font-semibold text-white' : 'font-medium text-slate-200')}>
              {displayName}
            </p>
            <span className={cn('text-[10.5px] shrink-0', unread > 0 && !muted ? 'text-blue-400 font-semibold' : 'text-slate-500')}>
              {formatListTime(chat.lastMessageAt)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className={cn('text-xs truncate', unread > 0 ? 'text-slate-300' : 'text-slate-500')}>
              {lastMessagePreview(chat)}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {muted && <BellOff className="w-3 h-3 text-slate-600" />}
              {isPinned(chat) && unread === 0 && <Pin className="w-3 h-3 text-slate-600 rotate-45" />}
              {unread > 0 && (
                <span className={cn(
                  'min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center',
                  muted ? 'bg-slate-600 text-slate-200' : 'bg-blue-600 text-white'
                )}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => openChatMenu(e, chat)}
          className="absolute right-2 top-2 p-1 rounded-md bg-[#0F172A] border border-white/10 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
          title="More"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Conversation helpers
  // -------------------------------------------------------------------------
  const conversationSubtitle = () => {
    if (!selectedChat) return '';
    const typing = typingNames(selectedChat);
    if (typing.length > 0) return typing.length === 1 ? `${typing[0]} is typing…` : `${typing.slice(0, 2).join(', ')} are typing…`;
    if (selectedChat.isDirect) {
      const other = otherMemberOf(selectedChat);
      if (!other) return 'Direct message';
      if (other.isOnline) return 'Online';
      const seen = toJsDate(other.lastSeen);
      return seen ? `Last seen ${isToday(seen) ? format(seen, 'HH:mm') : format(seen, 'dd.MM HH:mm')}` : 'Offline';
    }
    const total = selectedChat.members?.length || 0;
    const online = selectedChatMembers.filter((m) => m.isOnline).length;
    return `${total} members${online > 0 ? ` · ${online} online` : ''}`;
  };

  const sharedMedia = useMemo(
    () => messages.filter((m: any) => !m.deleted && m.type === 'image' && m.fileUrl).slice(-24).reverse(),
    [messages]
  );
  const sharedFiles = useMemo(
    () => messages.filter((m: any) => !m.deleted && m.type === 'file' && m.fileUrl).slice(-20).reverse(),
    [messages]
  );

  const openMessageMenu = (e: React.MouseEvent, msg: any) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 280);
    setChatMenu(null);
    setReactionPickerFor(null);
    setMessageMenu({ messageId: msg.id, x, y });
  };

  const menuChat = chatMenu ? chats.find((c) => c.id === chatMenu.chatId) : null;
  const menuMessage = messageMenu ? messages.find((m) => m.id === messageMenu.messageId) : null;

  // -------------------------------------------------------------------------
  // Render: one message
  // -------------------------------------------------------------------------
  const renderMessage = (msg: any, index: number) => {
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const msgDate = toJsDate(msg.createdAt);
    const prevDate = prev ? toJsDate(prev.createdAt) : null;
    const showDay = !!msgDate && (!prevDate || !isSameDay(msgDate, prevDate));

    const dayDivider = showDay ? (
      <div key={`day-${msg.id}`} className="flex items-center justify-center py-2">
        <span className="px-3 py-1 rounded-full bg-white/[0.04] border border-white/5 text-[11px] text-slate-400">
          {formatDayLabel(msgDate!)}
        </span>
      </div>
    ) : null;

    if (msg.type === 'system') {
      return (
        <React.Fragment key={msg.id}>
          {dayDivider}
          <div id={`chat-message-${msg.id}`} className="flex justify-center py-1">
            <span className="text-[11px] text-slate-500 bg-white/[0.02] rounded-full px-3 py-1">{msg.text}</span>
          </div>
        </React.Fragment>
      );
    }

    const isMe = msg.senderId === currentUserId;
    const sender = userById.get(String(msg.senderId));
    const liveSenderName = sender?.name || msg.senderName || 'User';

    const sameAsPrev =
      !!prev && !showDay && prev.type !== 'system' && prev.senderId === msg.senderId &&
      !!prevDate && !!msgDate && msgDate.getTime() - prevDate.getTime() < 5 * 60 * 1000;
    const nextDate = next ? toJsDate(next.createdAt) : null;
    const sameAsNext =
      !!next && next.type !== 'system' && next.senderId === msg.senderId &&
      !!nextDate && !!msgDate && isSameDay(nextDate, msgDate) && nextDate.getTime() - msgDate.getTime() < 5 * 60 * 1000;

    const showSenderName = !isMe && !selectedChat?.isDirect && !sameAsPrev;
    const showAvatarSlot = !isMe && !selectedChat?.isDirect;
    const showAvatar = showAvatarSlot && !sameAsNext;

    const reactionEntries = Object.entries(msg.reactions || {})
      .filter(([, ids]) => Array.isArray(ids) && (ids as string[]).length > 0) as [string, string[]][];

    const bubbleBase = isMe
      ? 'bg-blue-600 text-white'
      : 'bg-[#151C2E] text-slate-100 border border-white/[0.06]';

    const corner = isMe
      ? cn('rounded-2xl', sameAsPrev && 'rounded-tr-md', sameAsNext && 'rounded-br-md')
      : cn('rounded-2xl', sameAsPrev && 'rounded-tl-md', sameAsNext && 'rounded-bl-md');

    const isMediaOnly = !msg.deleted && (msg.type === 'image' || msg.type === 'gif') && !msg.replyTo;

    return (
      <React.Fragment key={msg.id}>
        {dayDivider}
        <div
          id={`chat-message-${msg.id}`}
          className={cn(
            'group/msg flex items-end gap-2 rounded-xl transition-all duration-300',
            isMe ? 'justify-end' : 'justify-start',
            sameAsPrev ? 'mt-0.5' : 'mt-3'
          )}
          onContextMenu={(e) => openMessageMenu(e, msg)}
        >
          {showAvatarSlot && (
            <div className="w-8 shrink-0">
              {showAvatar && <Avatar src={sender?.avatar} name={liveSenderName} seed={String(msg.senderId)} size={32} />}
            </div>
          )}

          <div className={cn('relative max-w-[78%] sm:max-w-[68%] flex flex-col', isMe ? 'items-end' : 'items-start')}>
            {showSenderName && (
              <span className="text-[11px] font-semibold mb-1 ml-1" style={{ color: 'rgb(147 197 253)' }}>
                {liveSenderName}
              </span>
            )}

            <div
              className={cn(
                'relative shadow-sm',
                isMediaOnly ? 'p-1' : 'px-3 py-2',
                msg.deleted ? 'bg-white/[0.03] border border-white/5 text-slate-500 rounded-2xl' : cn(bubbleBase, corner)
              )}
            >
              {msg.deleted ? (
                <p className="text-[13px] italic flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> This message was deleted
                </p>
              ) : (
                <>
                  {msg.replyTo && (
                    <button
                      type="button"
                      onClick={() => scrollToRepliedMessage(msg.replyTo.messageId)}
                      className={cn(
                        'w-full text-left mb-1.5 rounded-lg px-2.5 py-1.5 border-l-2 transition-colors',
                        isMe
                          ? 'bg-black/15 border-white/60 hover:bg-black/25'
                          : 'bg-black/25 border-blue-400 hover:bg-black/35'
                      )}
                      title="Go to replied message"
                    >
                      <p className="text-[11px] font-semibold opacity-90 truncate">
                        {msg.replyTo.senderName || 'User'}
                      </p>
                      <p className="text-[11px] opacity-70 truncate">
                        {msg.replyTo.type === 'gif'
                          ? 'GIF'
                          : msg.replyTo.type === 'image'
                            ? `Photo${msg.replyTo.fileName ? ` · ${msg.replyTo.fileName}` : ''}`
                            : msg.replyTo.type === 'file'
                              ? `File${msg.replyTo.fileName ? ` · ${msg.replyTo.fileName}` : ''}`
                              : (msg.replyTo.text || 'Message')}
                      </p>
                    </button>
                  )}

                  {msg.type === 'text' && renderMessageText(msg.text || '')}

                  {msg.type === 'image' && (
                    <img
                      src={msg.fileUrl}
                      alt={msg.fileName || 'Photo'}
                      className="rounded-xl max-h-72 max-w-full object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
                      onClick={() => setShowPhotoModal(msg.fileUrl)}
                      loading="lazy"
                    />
                  )}

                  {msg.type === 'gif' && (
                    <div>
                      <img
                        src={msg.gifUrl}
                        alt={msg.gifTitle || 'GIF'}
                        className="rounded-xl max-h-64 max-w-full object-contain bg-black/20"
                        loading="lazy"
                      />
                      <span className="block text-[9px] opacity-50 px-1 pt-0.5">GIF via GIPHY</span>
                    </div>
                  )}

                  {msg.type === 'file' && (
                    <a
                      href={msg.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        'flex items-center gap-3 rounded-xl p-2 pr-3 min-w-[220px] transition-colors',
                        isMe ? 'bg-black/15 hover:bg-black/25' : 'bg-black/25 hover:bg-black/35'
                      )}
                    >
                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', isMe ? 'bg-white/15' : 'bg-blue-500/15')}>
                        <FileText className={cn('w-5 h-5', isMe ? 'text-white' : 'text-blue-400')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{msg.fileName}</p>
                        <p className="text-[11px] opacity-60">{formatFileSize(msg.fileSize)}</p>
                      </div>
                      <Download className="w-4 h-4 opacity-70 shrink-0" />
                    </a>
                  )}
                </>
              )}

              <div className={cn(
                'flex items-center justify-end gap-1 select-none',
                isMediaOnly ? 'absolute bottom-2 right-2.5 bg-black/55 rounded-full px-1.5 py-0.5 text-white' : 'mt-0.5 -mb-0.5',
                !isMediaOnly && (isMe ? 'text-blue-100/70' : 'text-slate-500')
              )}>
                {msg.editedAt && !msg.deleted && <span className="text-[10px] italic">edited</span>}
                <span className="text-[10px] tabular-nums">
                  {msgDate ? format(msgDate, 'HH:mm') : '…'}
                </span>
                {isMe && !msg.deleted &&
                  (msg.seenBy?.length > 1 ? (
                    <CheckCheck className="w-3.5 h-3.5 text-sky-200" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  ))}
              </div>
            </div>

            {reactionEntries.length > 0 && !msg.deleted && (
              <div className={cn('flex flex-wrap gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
                {reactionEntries.map(([key, ids]) => {
                  const mine = ids.includes(currentUserId);
                  const names = ids.map((id) => userById.get(String(id))?.name || 'User').join(', ');
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleToggleReaction(msg, key); }}
                      title={names}
                      className={cn(
                        'h-6 px-2 rounded-full text-xs flex items-center gap-1 border transition-colors',
                        mine ? 'bg-blue-500/20 border-blue-500/40 text-blue-100' : 'bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.08]'
                      )}
                    >
                      <span>{REACTION_EMOJI[key] || key}</span>
                      <span className="text-[10px] font-semibold">{ids.length}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Hover toolbar */}
            {!msg.deleted && (
              <div
                className={cn(
                  'absolute -top-4 z-20 flex items-center gap-0.5 bg-[#0F172A] border border-white/10 rounded-lg p-0.5 shadow-xl opacity-0 group-hover/msg:opacity-100 transition-opacity',
                  isMe ? 'right-1' : 'left-1',
                  (reactionPickerFor === msg.id || messageMenu?.messageId === msg.id) && 'opacity-100'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setReactionPickerFor((cur) => (cur === msg.id ? null : msg.id))}
                  className="p-1.5 rounded-md text-slate-400 hover:text-amber-300 hover:bg-white/5"
                  title="React"
                >
                  <SmilePlus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleReplyToMessage(msg)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-blue-300 hover:bg-white/5"
                  title="Reply"
                >
                  <Reply className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => openMessageMenu(e, msg)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5"
                  title="More"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>

                {reactionPickerFor === msg.id && (
                  <div className={cn(
                    'absolute bottom-full mb-1 flex items-center gap-0.5 bg-[#0F172A] border border-white/10 rounded-full px-1.5 py-1 shadow-2xl',
                    isMe ? 'right-0' : 'left-0'
                  )}>
                    {REACTIONS.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => handleToggleReaction(msg, r.key)}
                        className="w-8 h-8 rounded-full text-lg hover:bg-white/10 hover:scale-110 transition-transform"
                      >
                        {r.emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </React.Fragment>
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const otherUsers = users.filter((u) => u.id !== currentUserId);

  const userPickRow = (user: any, selected: boolean, onToggle: () => void) => (
    <button
      key={user.id}
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors border',
        selected ? 'bg-blue-500/10 border-blue-500/30' : 'border-transparent hover:bg-white/[0.04]'
      )}
    >
      <span className="flex items-center gap-3 min-w-0">
        <Avatar src={user.avatar} name={user.name || user.email || 'User'} seed={user.id} size={36} online={!!user.isOnline} />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-white truncate">{user.name || 'Unnamed User'}</span>
          <span className="block text-[11px] text-slate-500 truncate">
            {user.role || 'User'}{user.teamName ? ` · ${user.teamName}` : ''}
          </span>
        </span>
      </span>
      <span className={cn(
        'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
        selected ? 'bg-blue-600 border-blue-500 text-white' : 'border-white/20 text-transparent'
      )}>
        <Check className="w-3.5 h-3.5" />
      </span>
    </button>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {!standalone && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110]"
            />
          )}

          <motion.div
            initial={standalone ? false : { x: '100%' }}
            animate={standalone ? undefined : { x: 0 }}
            exit={standalone ? undefined : { x: '100%' }}
            transition={standalone ? undefined : { type: 'spring', damping: 25, stiffness: 200 }}
            className={
              standalone
                ? "fixed inset-0 w-full bg-[#070B16] z-[120] flex flex-col"
                : "fixed top-0 right-0 bottom-0 w-full max-w-6xl bg-[#070B16] border-l border-white/10 z-[120] flex flex-col shadow-2xl"
            }
          >
            <div className="relative flex-1 flex overflow-hidden">
              {/* ============================================================ */}
              {/* Left: chat list                                              */}
              {/* ============================================================ */}
              <aside
                className={cn(
                  'w-full md:w-[320px] xl:w-[340px] flex flex-col border-r border-white/[0.06] bg-[#0A0F1C] shrink-0',
                  selectedChat && 'hidden md:flex'
                )}
              >
                <div className="px-4 pt-4 pb-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <MessageSquare className="w-4.5 h-4.5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-white leading-tight">Team Chat</h2>
                        <p className="text-[11px] text-slate-500">
                          {totalUnread > 0 ? `${totalUnread} unread` : 'All caught up'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setNewDirectDialog({ search: '' })}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                        title="New message"
                      >
                        <SquarePen className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupDialog({ name: '', selectedIds: [], search: '' })}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                        title="New group"
                      >
                        <Users className="w-4 h-4" />
                      </button>
                      {!standalone && (
                        <button
                          onClick={onClose}
                          className="p-2 rounded-lg hover:bg-white/5 text-slate-400"
                          title="Close"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search chats and people…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                    {searchTerm && (
                      <button type="button" onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    {([
                      ['all', 'All'],
                      ['unread', 'Unread'],
                      ['groups', 'Groups'],
                      ['direct', 'Direct']
                    ] as [ListTab, string][]).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setListTab(id)}
                        className={cn(
                          'flex-1 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors',
                          listTab === id ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
                        )}
                      >
                        {label}
                        {id === 'unread' && tabCounts.unread > 0 && (
                          <span className="ml-1 text-[10px] text-blue-400">{tabCounts.unread}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-3">
                  {pinnedChats.length > 0 && (
                    <>
                      <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                        <Pin className="w-3 h-3 rotate-45" /> Pinned
                      </p>
                      <div className="space-y-0.5">{pinnedChats.map(renderChatRow)}</div>
                      {otherChats.length > 0 && (
                        <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                          {listTab === 'groups' ? 'Groups' : listTab === 'direct' ? 'Direct' : listTab === 'unread' ? 'Unread' : 'All chats'}
                        </p>
                      )}
                    </>
                  )}
                  <div className="space-y-0.5">{otherChats.map(renderChatRow)}</div>

                  {listChats.length === 0 && peopleResults.length === 0 && (
                    <div className="py-12 text-center px-6">
                      <MessageCircle className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                      <p className="text-sm text-slate-400">
                        {searchTerm ? 'Nothing found' : listTab === 'unread' ? 'No unread chats' : 'No chats yet'}
                      </p>
                      {!searchTerm && listTab === 'all' && (
                        <button
                          type="button"
                          onClick={() => setNewDirectDialog({ search: '' })}
                          className="mt-3 text-xs text-blue-400 hover:text-blue-300"
                        >
                          Start a conversation
                        </button>
                      )}
                    </div>
                  )}

                  {peopleResults.length > 0 && (
                    <>
                      <p className="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        People
                      </p>
                      <div className="space-y-0.5">
                        {peopleResults.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleStartDirectChat(user)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.04] text-left"
                          >
                            <Avatar src={user.avatar} name={user.name || user.email || 'User'} seed={user.id} size={36} online={!!user.isOnline} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-slate-200 truncate">{user.name || user.email}</span>
                              <span className="block text-[11px] text-slate-500 truncate">
                                {user.role || 'User'}{user.teamName ? ` · ${user.teamName}` : ''}
                              </span>
                            </span>
                            <MessageCircle className="w-4 h-4 text-blue-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </aside>

              {/* ============================================================ */}
              {/* Middle: conversation                                         */}
              {/* ============================================================ */}
              <section
                className={cn(
                  'flex-1 min-w-0 flex flex-col relative bg-[#070B16]',
                  !selectedChat && 'hidden md:flex'
                )}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {selectedChat ? (
                  <>
                    {/* Header */}
                    <header className="h-16 px-3 sm:px-4 border-b border-white/[0.06] flex items-center justify-between gap-3 bg-[#0A0F1C]/80 backdrop-blur shrink-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={closeConversation}
                          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:bg-white/5"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowInfoPanel((v) => !v)}
                          className="flex items-center gap-3 min-w-0 text-left"
                        >
                          <Avatar
                            src={selectedChat.isDirect ? otherMemberOf(selectedChat)?.avatar : ''}
                            name={getChatDisplayName(selectedChat)}
                            seed={selectedChat.id}
                            size={40}
                            online={selectedChat.isDirect ? !!otherMemberOf(selectedChat)?.isOnline : undefined}
                            square={!selectedChat.isDirect}
                          />
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                              {getChatDisplayName(selectedChat)}
                              {isMuted(selectedChat) && <BellOff className="w-3.5 h-3.5 text-slate-500" />}
                            </h3>
                            <p className={cn(
                              'text-[11.5px] truncate',
                              typingNames(selectedChat).length > 0 || (selectedChat.isDirect && otherMemberOf(selectedChat)?.isOnline)
                                ? 'text-emerald-400'
                                : 'text-slate-500'
                            )}>
                              {conversationSubtitle()}
                            </p>
                          </div>
                        </button>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setChatSearchOpen((v) => !v);
                            setChatSearchResults(null);
                          }}
                          className={cn('p-2 rounded-lg transition-colors', chatSearchOpen ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}
                          title="Search in chat"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleSummarize}
                          disabled={isSummarizing}
                          className="p-2 rounded-lg text-blue-400 hover:bg-white/5 transition-colors"
                          title="AI Summary"
                        >
                          <Sparkles className={cn('w-4 h-4', isSummarizing && 'animate-spin')} />
                        </button>
                        {!selectedChat.isDirect && canManageSelectedGroup && (
                          <button
                            type="button"
                            onClick={() => setAddMembersDialog({ selectedIds: [], search: '' })}
                            className="p-2 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                            title="Add members"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowInfoPanel((v) => !v)}
                          className={cn('p-2 rounded-lg transition-colors', showInfoPanel ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}
                          title="Chat info"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </div>
                    </header>

                    {/* Search in chat */}
                    {chatSearchOpen && (
                      <div className="px-4 py-2 border-b border-white/[0.06] bg-[#0A0F1C] shrink-0">
                        <form onSubmit={handleChatSearch} className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                            <input
                              autoFocus
                              value={chatSearchTerm}
                              onChange={(e) => setChatSearchTerm(e.target.value)}
                              placeholder="Search messages in this chat…"
                              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                            />
                          </div>
                          <button type="submit" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium">
                            {isSearchingChat ? '…' : 'Search'}
                          </button>
                          <button type="button" onClick={() => { setChatSearchOpen(false); setChatSearchResults(null); }} className="p-1.5 text-slate-500 hover:text-white">
                            <X className="w-4 h-4" />
                          </button>
                        </form>
                        {chatSearchResults && (
                          <div className="mt-2 max-h-56 overflow-y-auto custom-scrollbar rounded-lg border border-white/[0.06] bg-black/20 divide-y divide-white/[0.04]">
                            {chatSearchResults.length === 0 ? (
                              <p className="px-3 py-4 text-xs text-slate-500 text-center">No messages found (searches the latest 100).</p>
                            ) : chatSearchResults.map((m: any) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => scrollToRepliedMessage(m.id)}
                                className="w-full text-left px-3 py-2 hover:bg-white/[0.04]"
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-blue-300 truncate">{userById.get(String(m.senderId))?.name || m.senderName}</span>
                                  <span className="text-[10px] text-slate-500 shrink-0">{toJsDate(m.createdAt) ? format(toJsDate(m.createdAt)!, 'dd.MM HH:mm') : ''}</span>
                                </span>
                                <span className="block text-xs text-slate-300 truncate">{m.text || m.fileName || ''}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pinned message */}
                    {pinnedMessage && (
                      <div className="px-4 py-2 bg-blue-600/[0.07] border-b border-blue-500/15 flex items-center justify-between gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={() => scrollToRepliedMessage(pinnedMessage.id)}
                          className="flex items-center gap-2.5 min-w-0 text-left"
                        >
                          <Pin className="w-3.5 h-3.5 text-blue-400 shrink-0 rotate-45" />
                          <span className="min-w-0">
                            <span className="block text-[10px] uppercase tracking-wider font-semibold text-blue-400">Pinned message</span>
                            <span className="block text-xs text-slate-300 truncate">
                              <span className="font-semibold mr-1">{userById.get(String(pinnedMessage.senderId))?.name || pinnedMessage.senderName}:</span>
                              {pinnedMessage.text || pinnedMessage.fileName || '[File]'}
                            </span>
                          </span>
                        </button>
                        <button
                          onClick={() => chatService.pinMessage(selectedChat.id, null)}
                          className="p-1 text-blue-400 hover:text-white shrink-0"
                          title="Unpin"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Messages */}
                    <div
                      ref={messagesScrollRef}
                      onScroll={handleMessagesScroll}
                      className="flex-1 overflow-y-auto custom-scrollbar px-3 sm:px-6 py-4"
                    >
                      <div className="max-w-3xl mx-auto">
                        {hasMoreMessages && (
                          <div className="flex justify-center pb-2">
                            <button
                              type="button"
                              onClick={loadOlderMessages}
                              disabled={isLoadingOlder}
                              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10"
                            >
                              {isLoadingOlder ? 'Loading…' : 'Load earlier messages'}
                            </button>
                          </div>
                        )}

                        {messages.length === 0 && (
                          <div className="py-16 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                              <MessageCircle className="w-6 h-6 text-slate-600" />
                            </div>
                            <p className="text-sm text-slate-400">No messages here yet</p>
                            <p className="text-xs text-slate-600 mt-1">Send a message or drop a file to start.</p>
                          </div>
                        )}

                        {messages.map((msg, i) => renderMessage(msg, i))}
                        <div ref={messagesEndRef} />
                      </div>
                    </div>

                    {showJumpToBottom && (
                      <button
                        type="button"
                        onClick={jumpToBottom}
                        className="absolute right-6 bottom-28 z-20 w-10 h-10 rounded-full bg-[#0F172A] border border-white/10 text-slate-300 hover:text-white shadow-xl flex items-center justify-center"
                        title="Jump to latest"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    )}

                    {/* Composer */}
                    <div className="px-3 sm:px-6 pb-4 pt-2 shrink-0">
                      <div className="max-w-3xl mx-auto">
                        {(replyingTo || editingMessage) && (
                          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2">
                            <div className={cn('min-w-0 border-l-2 pl-3', editingMessage ? 'border-amber-400' : 'border-blue-400')}>
                              <p className={cn('text-[11px] font-semibold truncate flex items-center gap-1', editingMessage ? 'text-amber-300' : 'text-blue-300')}>
                                {editingMessage ? <><Pencil className="w-3 h-3" /> Editing message</> : <><Reply className="w-3 h-3" /> Replying to {getReplySenderName(replyingTo)}</>}
                              </p>
                              <p className="text-xs text-slate-400 truncate">
                                {editingMessage ? editingMessage.text : getReplyPreviewText(replyingTo)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (editingMessage) setNewMessage('');
                                setEditingMessage(null);
                                setReplyingTo(null);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 shrink-0"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {showEmojiPicker && (
                          <div className="mb-2 rounded-xl border border-white/10 bg-[#0F172A] p-3 shadow-xl">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Emoji</span>
                              <button
                                type="button"
                                onClick={() => setShowEmojiPicker(false)}
                                className="p-1 text-slate-500 hover:text-white"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-8 sm:grid-cols-10 gap-1">
                              {emojiOptions.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleEmojiSelect(emoji)}
                                  className="h-9 rounded-lg text-xl hover:bg-white/10 transition-colors"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {showGifPicker && (
                          <div className="mb-2 rounded-xl border border-white/10 bg-[#0F172A] p-3 shadow-xl">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <form onSubmit={handleGifSearch} className="flex-1 flex items-center gap-2">
                                <div className="relative flex-1">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                  <input
                                    type="text"
                                    value={gifSearchTerm}
                                    onChange={(e) => setGifSearchTerm(e.target.value)}
                                    placeholder="Search GIFs..."
                                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                  />
                                </div>
                                <button
                                  type="submit"
                                  disabled={isLoadingGifs}
                                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
                                >
                                  Search
                                </button>
                              </form>
                              <button
                                type="button"
                                onClick={() => setShowGifPicker(false)}
                                className="p-1.5 text-slate-500 hover:text-white"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            {gifError ? (
                              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-3 text-xs text-rose-300">
                                {gifError}
                              </div>
                            ) : isLoadingGifs ? (
                              <div className="py-8 flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                              </div>
                            ) : (
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto custom-scrollbar">
                                {gifResults.map((gif) => (
                                  <button
                                    key={gif.id}
                                    type="button"
                                    onClick={() => handleSendGif(gif)}
                                    className="rounded-lg overflow-hidden bg-black/30 border border-white/5 hover:border-blue-500/50 transition-all"
                                    title={gif.title || 'Send GIF'}
                                  >
                                    <img
                                      src={gif.previewUrl || gif.url}
                                      alt={gif.title || 'GIF'}
                                      className="w-full h-24 object-cover"
                                      loading="lazy"
                                    />
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="mt-2 text-right text-[9px] text-slate-600">
                              Powered by GIPHY
                            </div>
                          </div>
                        )}

                        <form
                          onSubmit={handleSendMessage}
                          className="rounded-2xl border border-white/[0.08] bg-[#0F1525] focus-within:border-blue-500/40 transition-colors"
                        >
                          {pendingFiles.length > 0 && (
                            <div className="flex flex-wrap gap-2 p-3 pb-0">
                              {pendingFiles.map((item, idx) => (
                                <div key={idx} className="relative group">
                                  {item.type === 'image' ? (
                                    <img
                                      src={item.preview}
                                      className="w-20 h-20 rounded-xl object-cover border border-white/10"
                                      alt="Preview"
                                    />
                                  ) : (
                                    <div className="w-44 h-20 rounded-xl bg-white/[0.04] border border-white/10 flex items-center gap-2 px-3">
                                      <FileText className="w-6 h-6 text-blue-400 shrink-0" />
                                      <span className="min-w-0">
                                        <span className="block text-xs text-slate-200 truncate">{item.file.name}</span>
                                        <span className="block text-[10px] text-slate-500">{formatFileSize(item.file.size)}</span>
                                      </span>
                                    </div>
                                  )}
                                  {!isUploading && (
                                    <button
                                      type="button"
                                      onClick={() => removePendingFile(idx)}
                                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#0F172A] border border-white/20 text-slate-300 hover:text-white hover:bg-red-500 rounded-full flex items-center justify-center shadow-lg transition-colors"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {isUploading && uploadProgress.length > 0 && (
                            <div className="px-3 pt-3">
                              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                                <span>Uploading {uploadProgress.length} file{uploadProgress.length > 1 ? 's' : ''}…</span>
                                <span>{Math.round(uploadProgress.reduce((a, b) => a + b, 0) / uploadProgress.length)}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 transition-all"
                                  style={{ width: `${uploadProgress.reduce((a, b) => a + b, 0) / uploadProgress.length}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="relative">
                            {showMentionDropdown && filteredMentionCandidates.length > 0 && (
                              <div className="absolute bottom-full mb-2 left-0 right-0 z-30 bg-[#0F172A] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
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
                                          <div className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-300 flex items-center justify-center font-bold">
                                            @
                                          </div>
                                        ) : (
                                          <Avatar src={candidate.avatar} name={candidate.name} seed={candidate.id} size={32} />
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

                            <textarea
                              ref={messageInputRef}
                              rows={1}
                              placeholder={
                                isUploading
                                  ? 'Uploading…'
                                  : editingMessage
                                    ? 'Edit message…'
                                    : `Message ${getChatDisplayName(selectedChat)}`
                              }
                              value={newMessage}
                              onChange={handleTyping}
                              onKeyDown={handleComposerKeyDown}
                              onPaste={handlePaste}
                              onBlur={() => {
                                setTimeout(() => {
                                  setShowMentionDropdown(false);
                                }, 150);
                              }}
                              onFocus={() => updateMentionState(newMessage)}
                              disabled={isUploading}
                              className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-white placeholder:text-slate-500 focus:outline-none disabled:opacity-50 custom-scrollbar"
                              style={{ maxHeight: 160 }}
                            />
                          </div>

                          <div className="flex items-center justify-between px-2 pb-2 pt-1">
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => imageInputRef.current?.click()}
                                className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                                title="Photo"
                                disabled={!!editingMessage}
                              >
                                <ImageIcon className="w-4.5 h-4.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                                title={`File (max ${MAX_FILE_MB} MB)`}
                                disabled={!!editingMessage}
                              >
                                <Paperclip className="w-4.5 h-4.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowEmojiPicker((prev) => !prev);
                                  setShowGifPicker(false);
                                }}
                                className={cn(
                                  'p-2 rounded-lg transition-colors text-base leading-none',
                                  showEmojiPicker ? 'bg-blue-600/10 text-blue-400' : 'hover:bg-white/5 text-slate-400'
                                )}
                                title="Emoji"
                              >
                                😊
                              </button>
                              <button
                                type="button"
                                onClick={handleToggleGifPicker}
                                disabled={!!editingMessage}
                                className={cn(
                                  'px-2 py-1.5 rounded-lg transition-colors text-[10px] font-black tracking-wide',
                                  showGifPicker ? 'bg-blue-600/10 text-blue-400' : 'hover:bg-white/5 text-slate-400'
                                )}
                                title="GIF"
                              >
                                GIF
                              </button>
                              <span className="hidden sm:inline text-[10.5px] text-slate-600 ml-2">
                                Enter to send · Shift+Enter new line · drop files here
                              </span>
                            </div>

                            <button
                              type="submit"
                              disabled={(!newMessage.trim() && pendingFiles.length === 0) || isUploading}
                              className="h-9 px-3.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 text-sm font-medium"
                            >
                              {isUploading ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : editingMessage ? (
                                <><Check className="w-4 h-4" /> Save</>
                              ) : (
                                <Send className="w-4 h-4" />
                              )}
                            </button>
                          </div>
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
                    </div>

                    {/* Drag & drop overlay */}
                    {dragActive && (
                      <div className="absolute inset-3 z-40 rounded-2xl border-2 border-dashed border-blue-500/70 bg-blue-600/10 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
                        <UploadCloud className="w-12 h-12 text-blue-400 mb-3" />
                        <p className="text-lg font-semibold text-white">Drop files to send</p>
                        <p className="text-sm text-slate-400 mt-1">Photos and files up to {MAX_FILE_MB} MB</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center max-w-xs">
                      <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="w-7 h-7 text-blue-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-1.5">Your messages</h3>
                      <p className="text-sm text-slate-500 mb-5">
                        Pick a chat on the left, or start a new conversation with your team.
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setNewDirectDialog({ search: '' })}
                          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center gap-2"
                        >
                          <SquarePen className="w-4 h-4" /> New message
                        </button>
                        <button
                          type="button"
                          onClick={() => setGroupDialog({ name: '', selectedIds: [], search: '' })}
                          className="px-4 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 text-slate-200 text-sm font-medium flex items-center gap-2"
                        >
                          <Users className="w-4 h-4" /> New group
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* ============================================================ */}
              {/* Right: chat info                                             */}
              {/* ============================================================ */}
              {selectedChat && showInfoPanel && (
                <aside className="absolute xl:static inset-y-0 right-0 z-30 w-full sm:w-[340px] shrink-0 flex flex-col border-l border-white/[0.06] bg-[#0A0F1C] shadow-2xl xl:shadow-none">
                  <div className="h-16 px-4 flex items-center justify-between border-b border-white/[0.06] shrink-0">
                    <h4 className="text-sm font-semibold text-white">{selectedChat.isDirect ? 'Contact info' : 'Group info'}</h4>
                    <button type="button" onClick={() => setShowInfoPanel(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Identity */}
                    <div className="p-5 flex flex-col items-center text-center border-b border-white/[0.06]">
                      <Avatar
                        src={selectedChat.isDirect ? otherMemberOf(selectedChat)?.avatar : ''}
                        name={getChatDisplayName(selectedChat)}
                        seed={selectedChat.id}
                        size={80}
                        square={!selectedChat.isDirect}
                      />
                      {renameValue !== null ? (
                        <form
                          onSubmit={(e) => { e.preventDefault(); handleRenameGroup(); }}
                          className="mt-3 w-full flex items-center gap-2"
                        >
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                          <button type="submit" className="p-1.5 rounded-lg bg-blue-600 text-white"><Check className="w-4 h-4" /></button>
                          <button type="button" onClick={() => setRenameValue(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5"><X className="w-4 h-4" /></button>
                        </form>
                      ) : (
                        <h3 className="mt-3 text-base font-semibold text-white flex items-center gap-2">
                          {getChatDisplayName(selectedChat)}
                          {!selectedChat.isDirect && canManageSelectedGroup && (
                            <button type="button" onClick={() => setRenameValue(selectedChat.name || '')} className="p-1 rounded-md text-slate-500 hover:text-white" title="Rename group">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </h3>
                      )}
                      <p className="text-xs text-slate-500 mt-1">
                        {selectedChat.isDirect
                          ? (() => {
                              const other = otherMemberOf(selectedChat);
                              return other ? `${other.role || 'User'}${other.teamName ? ` · ${other.teamName}` : ''}` : 'Direct message';
                            })()
                          : `Group · ${selectedChat.members?.length || 0} members`}
                      </p>
                      {selectedChat.isDirect && otherMemberOf(selectedChat)?.email && (
                        <p className="text-xs text-slate-400 mt-1">{otherMemberOf(selectedChat)?.email}</p>
                      )}

                      <div className="mt-4 grid grid-cols-3 gap-2 w-full">
                        <button
                          type="button"
                          onClick={() => handleToggleMuteChat(selectedChat)}
                          className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] py-2.5 text-[11px] text-slate-300"
                        >
                          {isMuted(selectedChat) ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                          {isMuted(selectedChat) ? 'Unmute' : 'Mute'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePinChat(selectedChat)}
                          className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] py-2.5 text-[11px] text-slate-300"
                        >
                          {isPinned(selectedChat) ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                          {isPinned(selectedChat) ? 'Unpin' : 'Pin'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setChatSearchOpen(true); setChatSearchResults(null); }}
                          className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] py-2.5 text-[11px] text-slate-300"
                        >
                          <Search className="w-4 h-4" />
                          Search
                        </button>
                      </div>
                    </div>

                    {/* Members (groups) */}
                    {!selectedChat.isDirect && (
                      <div className="p-4 border-b border-white/[0.06]">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            Members · {selectedChatMembers.length}
                          </p>
                          {canManageSelectedGroup && (
                            <button
                              type="button"
                              onClick={() => setAddMembersDialog({ selectedIds: [], search: '' })}
                              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                            >
                              <UserPlus className="w-3.5 h-3.5" /> Add
                            </button>
                          )}
                        </div>

                        {selectedChatMembers.length > 6 && (
                          <div className="relative mb-2">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                            <input
                              value={infoMemberSearch}
                              onChange={(e) => setInfoMemberSearch(e.target.value)}
                              placeholder="Search members…"
                              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none"
                            />
                          </div>
                        )}

                        <div className="space-y-0.5">
                          {filterUsers(selectedChatMembers, infoMemberSearch).map((member) => {
                            const memberIsAdmin = isGroupAdmin(selectedChat, member.id);
                            const isMe = member.id === currentUserId;
                            return (
                              <div key={member.id} className="group/m flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-white/[0.03]">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <Avatar src={member.avatar} name={member.name || member.email || 'User'} seed={member.id} size={34} online={!!member.isOnline} />
                                  <div className="min-w-0">
                                    <p className="text-sm text-slate-200 truncate">
                                      {member.name || 'Unnamed User'}{isMe ? ' (You)' : ''}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate">{member.role || 'Member'}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {memberIsAdmin && (
                                    <span className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-1.5 py-0.5 mr-1">
                                      {selectedChat.createdBy === member.id ? 'Owner' : 'Admin'}
                                    </span>
                                  )}
                                  {!isMe && (
                                    <button
                                      type="button"
                                      onClick={() => handleStartDirectChat(member)}
                                      className="p-1.5 rounded-md text-slate-500 hover:text-blue-300 hover:bg-white/5 opacity-0 group-hover/m:opacity-100"
                                      title="Message"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {!isMe && canManageSelectedGroup && selectedChat.createdBy !== member.id && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleGroupAdmin(member)}
                                        className="p-1.5 rounded-md text-slate-500 hover:text-amber-300 hover:bg-white/5 opacity-0 group-hover/m:opacity-100"
                                        title={memberIsAdmin ? 'Remove admin' : 'Make admin'}
                                      >
                                        {memberIsAdmin ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveMember(member)}
                                        className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-white/5 opacity-0 group-hover/m:opacity-100"
                                        title="Remove from group"
                                      >
                                        <UserMinus className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Shared media */}
                    <div className="p-4 border-b border-white/[0.06]">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Photos</p>
                      {sharedMedia.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          {sharedMedia.map((m: any) => (
                            <button key={m.id} type="button" onClick={() => setShowPhotoModal(m.fileUrl)} className="aspect-square rounded-lg overflow-hidden bg-white/[0.03]">
                              <img src={m.fileUrl} alt="" className="w-full h-full object-cover hover:opacity-90" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600">No photos in the loaded messages.</p>
                      )}
                    </div>

                    <div className="p-4 border-b border-white/[0.06]">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Files</p>
                      {sharedFiles.length > 0 ? (
                        <div className="space-y-1">
                          {sharedFiles.map((m: any) => (
                            <a key={m.id} href={m.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                              <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs text-slate-200 truncate">{m.fileName}</span>
                                <span className="block text-[10px] text-slate-500">{formatFileSize(m.fileSize)}</span>
                              </span>
                              <Download className="w-3.5 h-3.5 text-slate-500" />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600">No files in the loaded messages.</p>
                      )}
                    </div>

                    {/* Danger zone */}
                    <div className="p-4 space-y-1.5">
                      {selectedChat.isDirect ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteDirectForMe(selectedChat)}
                          className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-4 h-4" /> Delete chat for me
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleLeaveGroup(selectedChat)}
                            className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10"
                          >
                            <LogOut className="w-4 h-4" /> Leave group
                          </button>
                          {canDeleteSelectedGroup && (
                            <button
                              type="button"
                              onClick={() => handleDeleteGroup(selectedChat)}
                              disabled={isDeletingChat}
                              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                            >
                              <Trash2 className={cn('w-4 h-4', isDeletingChat && 'animate-pulse')} /> Delete group for everyone
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </motion.div>

          {/* ================================================================ */}
          {/* Context menus                                                    */}
          {/* ================================================================ */}
          {chatMenu && menuChat && (
            <div
              className="fixed z-[150] w-56 rounded-xl border border-white/10 bg-[#0F172A] shadow-2xl p-1"
              style={{ left: chatMenu.x, top: chatMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              {[
                {
                  label: isPinned(menuChat) ? 'Unpin chat' : 'Pin chat',
                  icon: isPinned(menuChat) ? PinOff : Pin,
                  action: () => handleTogglePinChat(menuChat)
                },
                {
                  label: isMuted(menuChat) ? 'Unmute' : 'Mute notifications',
                  icon: isMuted(menuChat) ? Bell : BellOff,
                  action: () => handleToggleMuteChat(menuChat)
                },
                {
                  label: unreadCountFor(menuChat) > 0 ? 'Mark as read' : 'Mark as unread',
                  icon: unreadCountFor(menuChat) > 0 ? MailOpen : Mail,
                  action: () => handleToggleReadChat(menuChat)
                }
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => { setChatMenu(null); item.action(); }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.06]"
                >
                  <item.icon className="w-4 h-4 text-slate-400" /> {item.label}
                </button>
              ))}
              <div className="my-1 border-t border-white/[0.06]" />
              {menuChat.isDirect ? (
                <button
                  type="button"
                  onClick={() => { setChatMenu(null); handleDeleteDirectForMe(menuChat); }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" /> Delete for me
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { setChatMenu(null); handleLeaveGroup(menuChat); }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10"
                  >
                    <LogOut className="w-4 h-4" /> Leave group
                  </button>
                  {canDeleteGroup(menuChat) && (
                    <button
                      type="button"
                      onClick={() => { setChatMenu(null); handleDeleteGroup(menuChat); }}
                      className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-4 h-4" /> Delete group
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {messageMenu && menuMessage && !menuMessage.deleted && menuMessage.type !== 'system' && (
            <div
              className="fixed z-[150] w-52 rounded-xl border border-white/10 bg-[#0F172A] shadow-2xl p-1"
              style={{ left: messageMenu.x, top: messageMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-1.5 py-1 mb-1 border-b border-white/[0.06]">
                {REACTIONS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => { setMessageMenu(null); handleToggleReaction(menuMessage, r.key); }}
                    className="w-7 h-7 rounded-full text-base hover:bg-white/10"
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
              {[
                { show: true, label: 'Reply', icon: Reply, action: () => handleReplyToMessage(menuMessage) },
                { show: canEditMessage(menuMessage), label: 'Edit', icon: Pencil, action: () => startEditMessage(menuMessage) },
                { show: true, label: 'Copy', icon: Copy, action: () => handleCopyMessage(menuMessage) },
                { show: true, label: 'Pin message', icon: Pin, action: () => handlePinMessage(menuMessage) },
                { show: true, label: 'Create lead', icon: UserPlus, action: () => handleCreateLeadFromMsg(menuMessage) }
              ].filter((i) => i.show).map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => { setMessageMenu(null); item.action(); }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.06]"
                >
                  <item.icon className="w-4 h-4 text-slate-400" /> {item.label}
                </button>
              ))}
              {canDeleteMessage(menuMessage) && (
                <>
                  <div className="my-1 border-t border-white/[0.06]" />
                  <button
                    type="button"
                    onClick={() => { setMessageMenu(null); handleDeleteMessage(menuMessage); }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-4 h-4" /> Delete for everyone
                  </button>
                </>
              )}
            </div>
          )}

          {toast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[160] px-4 py-2 rounded-full bg-[#0F172A] border border-white/10 text-sm text-slate-200 shadow-2xl">
              {toast}
            </div>
          )}

          {/* ================================================================ */}
          {/* Dialogs                                                          */}
          {/* ================================================================ */}
          <AnimatePresence>
            {groupDialog && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setGroupDialog(null)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]"
                >
                  <div className="p-5 border-b border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">New group</h3>
                      <button type="button" onClick={() => setGroupDialog(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5"><X className="w-4 h-4" /></button>
                    </div>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Group name"
                      value={groupDialog.name}
                      onChange={(e) => setGroupDialog({ ...groupDialog, name: e.target.value })}
                      className="mt-4 w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />

                    {teamsInScope.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="text-[11px] text-slate-500 mr-1 self-center">Add whole team:</span>
                        {teamsInScope.map((team) => {
                          const allIn = team.ids.every((id) => groupDialog.selectedIds.includes(id));
                          return (
                            <button
                              key={team.name}
                              type="button"
                              onClick={() => setGroupDialog({
                                ...groupDialog,
                                selectedIds: allIn
                                  ? groupDialog.selectedIds.filter((id) => !team.ids.includes(id))
                                  : Array.from(new Set([...groupDialog.selectedIds, ...team.ids]))
                              })}
                              className={cn(
                                'px-2.5 py-1 rounded-full text-xs border transition-colors',
                                allIn ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.06]'
                              )}
                            >
                              {team.name} · {team.ids.length}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {groupDialog.selectedIds.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto custom-scrollbar">
                        {groupDialog.selectedIds.map((id) => {
                          const u = userById.get(id);
                          return (
                            <span key={id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-xs text-blue-100">
                              {u?.name || 'User'}
                              <button type="button" onClick={() => setGroupDialog({ ...groupDialog, selectedIds: groupDialog.selectedIds.filter((x) => x !== id) })} className="p-0.5 rounded-full hover:bg-white/10">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="relative mt-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search people by name, role or team…"
                        value={groupDialog.search}
                        onChange={(e) => setGroupDialog({ ...groupDialog, search: e.target.value })}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5 min-h-[160px]">
                    {filterUsers(otherUsers, groupDialog.search).map((user) =>
                      userPickRow(user, groupDialog.selectedIds.includes(user.id), () =>
                        setGroupDialog({
                          ...groupDialog,
                          selectedIds: groupDialog.selectedIds.includes(user.id)
                            ? groupDialog.selectedIds.filter((id) => id !== user.id)
                            : [...groupDialog.selectedIds, user.id]
                        })
                      )
                    )}
                    {filterUsers(otherUsers, groupDialog.search).length === 0 && (
                      <p className="text-center text-sm text-slate-500 py-8">No matching users.</p>
                    )}
                  </div>

                  <div className="p-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">{groupDialog.selectedIds.length} selected</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setGroupDialog(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                      <button
                        type="button"
                        onClick={handleCreateGroup}
                        disabled={!groupDialog.name.trim() || isCreatingGroupBusy}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium"
                      >
                        {isCreatingGroupBusy ? 'Creating…' : 'Create group'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}

            {newDirectDialog && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setNewDirectDialog(null)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]"
                >
                  <div className="p-5 border-b border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">New message</h3>
                      <button type="button" onClick={() => setNewDirectDialog(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="relative mt-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search people…"
                        value={newDirectDialog.search}
                        onChange={(e) => setNewDirectDialog({ search: e.target.value })}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5">
                    {filterUsers(otherUsers, newDirectDialog.search).map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleStartDirectChat(user)}
                        className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/[0.04]"
                      >
                        <Avatar src={user.avatar} name={user.name || user.email || 'User'} seed={user.id} size={38} online={!!user.isOnline} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-white truncate">{user.name || 'Unnamed User'}</span>
                          <span className="block text-[11px] text-slate-500 truncate">
                            {user.isOnline ? 'Online · ' : ''}{user.role || 'User'}{user.teamName ? ` · ${user.teamName}` : ''}
                          </span>
                        </span>
                        <MessageCircle className="w-4 h-4 text-blue-400 shrink-0" />
                      </button>
                    ))}
                    {filterUsers(otherUsers, newDirectDialog.search).length === 0 && (
                      <p className="text-center text-sm text-slate-500 py-8">No users found in your chat scope.</p>
                    )}
                  </div>
                </motion.div>
              </div>
            )}

            {addMembersDialog && selectedChat && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setAddMembersDialog(null)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]"
                >
                  <div className="p-5 border-b border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">Add members</h3>
                        <p className="text-xs text-slate-500 mt-0.5">to {selectedChat.name}</p>
                      </div>
                      <button type="button" onClick={() => setAddMembersDialog(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5"><X className="w-4 h-4" /></button>
                    </div>
                    {teamsInScope.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="text-[11px] text-slate-500 mr-1 self-center">Add whole team:</span>
                        {teamsInScope.map((team) => {
                          const candidates = team.ids.filter((id) => !selectedChat.members?.includes(id));
                          if (candidates.length === 0) return null;
                          const allIn = candidates.every((id) => addMembersDialog.selectedIds.includes(id));
                          return (
                            <button
                              key={team.name}
                              type="button"
                              onClick={() => setAddMembersDialog({
                                ...addMembersDialog,
                                selectedIds: allIn
                                  ? addMembersDialog.selectedIds.filter((id) => !candidates.includes(id))
                                  : Array.from(new Set([...addMembersDialog.selectedIds, ...candidates]))
                              })}
                              className={cn(
                                'px-2.5 py-1 rounded-full text-xs border transition-colors',
                                allIn ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.06]'
                              )}
                            >
                              {team.name} · {candidates.length}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="relative mt-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search by name, email, role or team…"
                        value={addMembersDialog.search}
                        onChange={(e) => setAddMembersDialog({ ...addMembersDialog, search: e.target.value })}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5 min-h-[160px]">
                    {filterUsers(users.filter((u) => !selectedChat.members?.includes(u.id)), addMembersDialog.search).map((user) =>
                      userPickRow(user, addMembersDialog.selectedIds.includes(user.id), () =>
                        setAddMembersDialog({
                          ...addMembersDialog,
                          selectedIds: addMembersDialog.selectedIds.includes(user.id)
                            ? addMembersDialog.selectedIds.filter((id) => id !== user.id)
                            : [...addMembersDialog.selectedIds, user.id]
                        })
                      )
                    )}
                    {filterUsers(users.filter((u) => !selectedChat.members?.includes(u.id)), addMembersDialog.search).length === 0 && (
                      <p className="text-center text-sm text-slate-500 py-8">No matching users found.</p>
                    )}
                  </div>
                  <div className="p-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">{addMembersDialog.selectedIds.length} selected</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setAddMembersDialog(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                      <button
                        type="button"
                        onClick={handleAddSelectedMembers}
                        disabled={addMembersDialog.selectedIds.length === 0}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium"
                      >
                        Add {addMembersDialog.selectedIds.length > 0 ? addMembersDialog.selectedIds.length : ''} member{addMembersDialog.selectedIds.length === 1 ? '' : 's'}
                      </button>
                    </div>
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
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="relative max-w-5xl w-full flex flex-col items-center"
                >
                  <img
                    src={showPhotoModal}
                    alt="Full size"
                    className="max-h-[85vh] w-auto max-w-full rounded-xl shadow-2xl object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <a
                      href={showPhotoModal}
                      target="_blank"
                      rel="noreferrer"
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" /> Download
                    </a>
                    <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm flex items-center gap-1.5">
                      <X className="w-4 h-4" /> Close
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {summary && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
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
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
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
