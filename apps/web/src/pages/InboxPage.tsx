import React, { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, ChevronDown, Megaphone, X, Check, CheckCheck, Pencil, Trash2, Reply, ShoppingBag, Info, HelpCircle, Plus, Search } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../lib/api";
import { Header } from "../components/ui/Header";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";

interface Conversation {
    id: string;
    type: string;
    hotelId?: string | null;
    orderId?: string | null;
    channelName?: string | null;
    title?: string | null;
    assignedStaffId?: string | null;
    lastMessageAt?: string | null;
    participants?: { id: string; kind: string; customerId?: string | null; guestIdentityId?: string | null; adminUserId?: string | null; platformAdminId?: string | null; canReply?: boolean; lastReadAt?: string | null }[];
    messages?: { id: string; body: string; createdAt: string; senderParticipantId: string }[];
    unreadCount?: number;
    sourceName?: string;
    sourceContext?: string;
    orderInfo?: { orderNumber: number; status: string } | null;
}

interface InboxData {
    orderConversations: Conversation[];
    hotelNotices: Conversation[];
    platformNotices: Conversation[];
    talkToStaff: Conversation[];
    communityChannels: Conversation[];
}

interface Message {
    id: string;
    conversationId?: string;
    body: string;
    createdAt: string;
    updatedAt?: string | null;
    deletedAt?: string | null;
    replyToId?: string | null;
    replyTo?: { body: string; deletedAt: string | null; senderParticipantId: string } | null;
    senderParticipantId: string;
}

type InboxSection = "orders" | "notices" | "platform" | "talk" | "community";

function uniqueById<T extends { id: string }>(items: T[]): T[] {
    return [...new Map(items.map((item) => [item.id, item])).values()];
}

const TypingDots: React.FC = () => <span className="inline-flex items-center gap-1" aria-label="Typing"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "currentColor", animation: "typingBounce 1.2s infinite", animationDelay: "-0.4s" }} /><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "currentColor", animation: "typingBounce 1.2s infinite", animationDelay: "-0.2s" }} /><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "currentColor", animation: "typingBounce 1.2s infinite", animationDelay: "0s" }} /></span>;

const TypingBubble: React.FC = () => <div className="flex justify-start" aria-live="polite"><div className="rounded-2xl rounded-bl-md border border-[#E5E7EB] bg-white px-4 py-3 text-[#6B7280] shadow-sm"><TypingDots /></div></div>;

export const InboxPage: React.FC<{ token?: string; actorId?: string; onBack: () => void; title?: string; mode?: "customer" | "hotel" | "global"; hotelId?: string; initialConversationId?: string }> = ({ token, actorId, onBack, title = "Inbox", mode = "customer", hotelId, initialConversationId }) => {
    const [inbox, setInbox] = useState<InboxData | null>(null);
    const [selected, setSelected] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [body, setBody] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [typing, setTyping] = useState(false);
    const [typingByConversation, setTypingByConversation] = useState<Record<string, boolean>>({});
    const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isNearBottom, setIsNearBottom] = useState(true);
    const [replyTo, setReplyTo] = useState<Message | null>(null);
    const [actionError, setActionError] = useState("");
    const [noticeTitle, setNoticeTitle] = useState("");
    const [noticeBody, setNoticeBody] = useState("");
    const [publishing, setPublishing] = useState(false);
    const [showCreateChannel, setShowCreateChannel] = useState(false);
    const [newChannelName, setNewChannelName] = useState("");
    const [creatingChannel, setCreatingChannel] = useState(false);
    const [showPlatformSupport, setShowPlatformSupport] = useState(false);
    const [supportBody, setSupportBody] = useState("");
    const [startingSupport, setStartingSupport] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState<InboxSection | "all">("all");
    const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);
    const [showDeleteConversationModal, setShowDeleteConversationModal] = useState(false);

    // Track the visual viewport height so the chat column (and composer) stays
    // above the on-screen keyboard on mobile. Fixed 100dvh does NOT shrink when
    // the keyboard opens; visualViewport.height does. When no visualViewport is
    // available we fall back to 100dvh.
    const [visualHeight, setVisualHeight] = useState<number | null>(null);
    useEffect(() => {
        if (typeof window === "undefined" || !window.visualViewport) return;
        const vv = window.visualViewport;
        const update = () => setVisualHeight(vv.height);
        update();
        vv.addEventListener("resize", update);
        vv.addEventListener("scroll", update);
        return () => {
            vv.removeEventListener("resize", update);
            vv.removeEventListener("scroll", update);
        };
    }, []);

    const ownParticipants = useMemo(() => (selected?.participants || []).filter((participant) => actorId ? (mode === "customer" ? participant.customerId === actorId : mode === "hotel" ? participant.adminUserId === actorId : participant.platformAdminId === actorId) : mode === "customer" ? participant.kind === "GUEST" : false), [selected?.participants, actorId, mode]);
    const ownParticipantIds = useMemo(() => new Set(ownParticipants.map((participant) => participant.id)), [ownParticipants]);
    // Announcements are deliberately read-only for recipients. The author,
    // however, can publish follow-ups without opening a separate conversation.
    const isAnnouncementPublisher = ownParticipants.some((participant) => participant.canReply) || Boolean(messages[0] && ownParticipantIds.has(messages[0].senderParticipantId));
    const isReadOnly = (selected?.type === "HOTEL_NOTICE" || selected?.type === "PLATFORM_NOTICE") && !isAnnouncementPublisher;
    const loadInbox = async () => {
        const result = await apiGet<InboxData>("/messaging/inbox", token);
        if (result.success && result.data) setInbox(result.data);
        setLoading(false);
    };

    const openConversation = async (conversation: Conversation) => {
        setSelected(conversation);
        conversationSocket.send({ type: "JOIN_CONVERSATION", conversationId: conversation.id });
        const result = await apiGet<{ conversation: Conversation; messages: Message[] }>(`/messaging/conversations/${conversation.id}/messages`, token);
        if (result.success && result.data) {
            setMessages(uniqueById(result.data.messages));
            if (result.data.conversation) setSelected(result.data.conversation);
        }
        const readResult = await apiPost<{ id: string; lastReadAt: string }>(`/messaging/conversations/${conversation.id}/read`, {}, token);
        if (readResult.success && readResult.data) setSelected((current) => current ? { ...current, participants: current.participants?.map((participant) => participant.id === readResult.data!.id ? { ...participant, lastReadAt: readResult.data!.lastReadAt } : participant) } : current);
        // Update unread count in inbox
        setInbox((current) => {
            if (!current) return current;
            const updateList = (list: Conversation[]) => list.map((item) => item.id === conversation.id ? { ...item, unreadCount: 0 } : item);
            return {
                orderConversations: updateList(current.orderConversations),
                hotelNotices: updateList(current.hotelNotices),
                platformNotices: updateList(current.platformNotices),
                talkToStaff: updateList(current.talkToStaff),
                communityChannels: updateList(current.communityChannels),
            };
        });
    };

    const conversationSocket = { send: (payload: unknown) => window.dispatchEvent(new CustomEvent("ladha:send", { detail: payload })) };

    useEffect(() => {
        const handleRealtime = (event: Event) => {
            const detail = (event as CustomEvent<{ type: string; payload: any }>).detail;
            if (detail.type === "MESSAGE_CREATED") {
                const message = detail.payload as Message;
                if (selected?.id === message.conversationId) {
                    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
                    void apiPost<{ id: string; lastReadAt: string }>(`/messaging/conversations/${message.conversationId}/read`, {}, token).then((result) => {
                        if (result.success && result.data) setSelected((current) => current ? { ...current, participants: current.participants?.map((participant) => participant.id === result.data!.id ? { ...participant, lastReadAt: result.data!.lastReadAt } : participant) } : current);
                    });
                }
                void loadInbox();
            }
            if (detail.type === "CONVERSATION_CREATED") {
                void loadInbox();
            }
            if (detail.type === "TYPING" && detail.payload?.conversationId) {
                const conversationId = detail.payload.conversationId as string;
                const isTyping = Boolean(detail.payload.typing);
                setTypingByConversation((current) => ({ ...current, [conversationId]: isTyping }));
                if (conversationId === selected?.id) setTyping(isTyping);
            }
            if (detail.type === "CONVERSATION_READ" && detail.payload?.conversationId === selected?.id) {
                setSelected((current) => current ? { ...current, participants: current.participants?.map((participant) => participant.id === detail.payload.participantId ? { ...participant, lastReadAt: detail.payload.lastReadAt } : participant) } : current);
            }
            if (detail.type === "MESSAGE_UPDATED") {
                const updated = detail.payload as Message;
                if (selected?.id === updated.conversationId) setMessages((current) => current.map((msg) => msg.id === updated.id ? updated : msg));
            }
        };
        window.addEventListener("ladha:realtime", handleRealtime);
        return () => window.removeEventListener("ladha:realtime", handleRealtime);
    }, [selected?.id, token]);

    useEffect(() => { void loadInbox(); }, [token]);
    useEffect(() => { setTyping(Boolean(selected?.id && typingByConversation[selected.id])); }, [selected?.id, typingByConversation]);

    // Deep-link support: when a specific conversation id is provided in the URL
    // (e.g. /inbox/:conversationId), open it as soon as the inbox has loaded.
    const openedInitialRef = useRef<string | null>(null);
    useEffect(() => {
        if (!initialConversationId || !inbox || openedInitialRef.current === initialConversationId) return;
        const lists: Conversation[][] = [inbox.orderConversations, inbox.hotelNotices, inbox.platformNotices, inbox.talkToStaff, inbox.communityChannels];
        const conversation = lists.flat().find((item) => item.id === initialConversationId);
        if (conversation) {
            openedInitialRef.current = initialConversationId;
            void openConversation(conversation);
        }
    }, [initialConversationId, inbox, selected]);

    useEffect(() => {
        if (typeof document === "undefined") return;
        const id = "td-typing-kf";
        if (!document.getElementById(id)) {
            const s = document.createElement("style");
            s.id = id;
            s.textContent = "@keyframes typingBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}";
            document.head.appendChild(s);
        }
    }, []);

    const scrollToBottom = () => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    };

    const handleScroll = () => {
        if (messagesContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
            setIsNearBottom(scrollHeight - scrollTop - clientHeight < 150);
        }
    };

    useEffect(() => { if (isNearBottom) scrollToBottom(); }, [messages, typing, isNearBottom]);
    useEffect(() => {
        setBody("");
        setIsNearBottom(true);
        if (textareaRef.current) {
            textareaRef.current.style.height = "";
            textareaRef.current.style.overflowY = "hidden";
        }
    }, [selected?.id]);

    const autoResizeTextarea = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            const maxComposerHeight = 96;
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxComposerHeight)}px`;
            textareaRef.current.style.overflowY = textareaRef.current.scrollHeight > maxComposerHeight ? "auto" : "hidden";
        }
    };

    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingBody, setEditingBody] = useState("");

    const startEditMessage = (message: Message) => { setEditingMessageId(message.id); setEditingBody(message.body); };
    const cancelEditMessage = () => { setEditingMessageId(null); setEditingBody(""); };

    const saveEditMessage = async () => {
        if (!selected || !editingMessageId || !editingBody.trim()) return;
        const result = await apiPatch<Message>(`/messaging/conversations/${selected.id}/messages/${editingMessageId}`, { body: editingBody.trim() }, token);
        if (result.success && result.data) {
            setMessages((current) => current.map((msg) => msg.id === editingMessageId ? { ...result.data!, conversationId: selected.id } : msg));
            cancelEditMessage();
        } else setActionError(result.error || "Unable to edit message");
    };

    const handleDeleteMessage = async (messageId: string) => {
        if (!selected) return;
        setDeleteMessageId(messageId);
    };

    const confirmDeleteMessage = async () => {
        if (!selected || !deleteMessageId) return;
        const result = await apiDelete(`/messaging/conversations/${selected.id}/messages/${deleteMessageId}`, token);
        if (result.success) setMessages((current) => current.filter((msg) => msg.id !== deleteMessageId));
        else setActionError(result.error || "Unable to delete message");
        setDeleteMessageId(null);
    };

    const handleDeleteConversation = async () => {
        if (!selected) return;
        setShowDeleteConversationModal(true);
    };

    const confirmDeleteConversation = async () => {
        if (!selected) return;
        const result = await apiDelete(`/messaging/conversations/${selected.id}`, token);
        if (result.success) { setSelected(null); setMessages([]); void loadInbox(); }
        else setActionError(result.error || "Unable to delete conversation");
        setShowDeleteConversationModal(false);
    };

    const send = async () => {
        if (!selected || !body.trim() || sending || isReadOnly) return;
        conversationSocket.send({ type: "TYPING_STOP", conversationId: selected.id });
        setSending(true);
        const result = await apiPost<Message>(`/messaging/conversations/${selected.id}/messages`, { body: body.trim(), replyToId: replyTo?.id || undefined }, token);
        if (result.success && result.data) {
            setMessages((current) => current.some((message) => message.id === result.data!.id) ? current : [...current, result.data!]);
            setBody(""); setReplyTo(null);
            if (textareaRef.current) { textareaRef.current.style.height = ""; textareaRef.current.style.overflowY = "hidden"; }
            void loadInbox();
        } else setActionError(result.error || "Unable to send message");
        setSending(false);
    };

    const publishNotice = async () => {
        if (!noticeBody.trim() || publishing) return;
        setPublishing(true);
        const endpoint = mode === "global" ? "/messaging/platform-notices" : "/messaging/hotel-notices";
        const body = mode === "global" ? { title: noticeTitle.trim() || undefined, body: noticeBody.trim() } : { hotelId, title: noticeTitle.trim() || undefined, body: noticeBody.trim() };
        const result = await apiPost(endpoint, body, token);
        setPublishing(false);
        if (result.success) { setNoticeTitle(""); setNoticeBody(""); void loadInbox(); }
        else setActionError(result.error || "Unable to publish notice");
    };
     
    // The active conversation is a fixed-height flex column: header (64px) on
    // top, scrollable messages in the middle, composer pinned at the bottom
    // immediately above the bottom nav. This is the single shared chat layout —
    // platform support, order chats, and staff conversations all render here.
    // env(safe-area-inset-bottom) keeps the composer clear of the nav on notched
    // phones where the nav's own safe-area padding makes it taller than 56/72px.
    const composerSafeArea = "env(safe-area-inset-bottom, 0px)";

    const startPlatformSupport = async () => {
        if (!supportBody.trim() || startingSupport) return;
        setStartingSupport(true);
        const result = await apiPost<{ conversation: Conversation }>("/messaging/platform-support", { body: supportBody.trim() }, token);
        setStartingSupport(false);
        if (!result.success || !result.data?.conversation) {
            setActionError(result.error || "Unable to contact platform support");
            return;
        }
        setSupportBody("");
        setShowPlatformSupport(false);
        await loadInbox();
        await openConversation(result.data.conversation);
    };

    const totalUnread = useMemo(() => {
        if (!inbox) return 0;
        const all = [...inbox.orderConversations, ...inbox.hotelNotices, ...inbox.platformNotices, ...inbox.talkToStaff, ...inbox.communityChannels];
        return all.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    }, [inbox]);

    const categoryTabs: { key: InboxSection | "all"; label: string; icon: React.ReactNode }[] = [
        { key: "all", label: "All", icon: <MessageCircle size={13} /> },
        { key: "orders", label: "Orders", icon: <ShoppingBag size={13} /> },
        { key: "platform", label: "Platform", icon: <Megaphone size={13} /> },
        { key: "talk", label: "Support", icon: <HelpCircle size={13} /> },
        { key: "community", label: "Community", icon: <MessageCircle size={13} /> },
    ];

    const allConversations = useMemo(() => {
        if (!inbox) return [];
        const items: { section: InboxSection; conv: Conversation }[] = [
            ...inbox.orderConversations.map((conv) => ({ section: "orders" as InboxSection, conv })),
            ...inbox.talkToStaff.map((conv) => ({ section: "talk" as InboxSection, conv })),
            ...inbox.communityChannels.map((conv) => ({ section: "community" as InboxSection, conv })),
            ...inbox.hotelNotices.map((conv) => ({ section: "notices" as InboxSection, conv })),
            ...inbox.platformNotices.map((conv) => ({ section: "platform" as InboxSection, conv })),
        ];
        return items;
    }, [inbox]);

    const filteredConversations = useMemo(() => {
        let items = allConversations;
        if (activeFilter !== "all") items = items.filter((item) => item.section === activeFilter);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            items = items.filter((item) => {
                const c = item.conv;
                return (c.sourceName?.toLowerCase().includes(q) || false) ||
                    (c.sourceContext?.toLowerCase().includes(q) || false) ||
                    (c.messages?.[0]?.body?.toLowerCase().includes(q) || false) ||
                    (c.channelName?.toLowerCase().includes(q) || false);
            });
        }
        return items;
    }, [allConversations, activeFilter, searchQuery]);

    const renderConversationCard = (conversation: Conversation) => {
        const latest = conversation.messages?.[0];
        const icon = conversation.type === "ORDER" ? ShoppingBag : conversation.type === "HOTEL_NOTICE" || conversation.type === "PLATFORM_NOTICE" ? Megaphone : conversation.type === "TALK_TO_STAFF" ? HelpCircle : MessageCircle;
        const iconBg = conversation.type === "ORDER" ? "bg-[#EBF5F0] text-[#114B36]" : conversation.type === "HOTEL_NOTICE" || conversation.type === "PLATFORM_NOTICE" ? "bg-[#FFF7D6] text-[#A16207]" : "bg-[#EBF5F0] text-[#114B36]";
        return <button key={conversation.id} onClick={() => void openConversation(conversation)} className="w-full flex items-center gap-3 text-left bg-white border border-[#E5E7EB] rounded-2xl p-4 hover:border-[#94CCB5] transition-colors">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center ${iconBg}`}>{React.createElement(icon, { size: 19 })}</div>
            <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3">
                    <span className="font-bold text-[#1F2937] truncate">
                        {conversation.type === "ORDER" ? `Order #${conversation.orderInfo?.orderNumber || ""}` : conversation.sourceName || "Conversation"}
                    </span>
                    <span className="text-[0.65rem] text-[#9CA3AF] shrink-0">{latest ? new Date(latest.createdAt).toLocaleDateString() : ""}</span>
                </div>
                {conversation.sourceContext && <p className="text-[0.65rem] font-semibold text-[#A16207] mt-1">{conversation.sourceContext}</p>}
                {typingByConversation[conversation.id] ? <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#114B36]"><TypingDots /> <span>typing…</span></p> : <p className="text-sm text-[#6B7280] truncate mt-1">{latest?.body || "No messages yet"}</p>}
            </div>
            {Boolean(conversation.unreadCount) && <span className="min-w-5 h-5 rounded-full bg-[#22C55E] text-white text-[0.65rem] font-bold flex items-center justify-center px-1">{conversation.unreadCount! > 99 ? "99+" : conversation.unreadCount}</span>}
        </button>;
    };

    const renderSection = (title: string, conversations: Conversation[], emptyMsg: string) => (
        <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#6B7280]">{title}</h3>
                {conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0) > 0 && (
                    <span className="h-4 rounded-full bg-[#22C55E] text-white text-[0.55rem] font-bold flex items-center justify-center px-1.5">
                        {conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)}
                    </span>
                )}
            </div>
            {conversations.length === 0 ? <p className="text-xs text-[#9CA3AF] py-2">{emptyMsg}</p> : <div className="space-y-2">{conversations.map(renderConversationCard)}</div>}
        </div>
    );

    return (
        <div className={mode === "customer" ? "app-container" : "admin-container inbox-workspace"}>
            <Header title={selected ? (selected.type === "ORDER" ? `Order #${selected.orderInfo?.orderNumber || ""}` : selected.sourceName || "Conversation") : title} subtitle={selected ? selected.sourceContext || "" : "Messages, updates and support"} onBack={selected ? () => setSelected(null) : onBack} />
            {!selected ? (
                <div className="px-4 py-5">
                    <div className="mb-5">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#114B36]">{title}</p>
                        <h2 className="text-2xl font-black text-[#1F2937]">Stay in the loop</h2>
                        <p className="text-xs text-[#6B7280] mt-1">{totalUnread > 0 ? `${totalUnread} unread` : "No new messages"}</p>
                    </div>
                    {mode !== "global" && <button onClick={() => setShowPlatformSupport(true)} className="mb-4 flex w-full items-center justify-between rounded-2xl border border-[#B9DCCB] bg-[#EBF5F0] px-4 py-3 text-left transition-colors hover:bg-[#DCF0E6]"><span><span className="block text-sm font-extrabold text-[#114B36]">Need help with Ladha?</span><span className="mt-0.5 block text-xs text-[#49715F]">Contact Platform Support privately.</span></span><HelpCircle size={20} className="text-[#114B36]" /></button>}
                    {loading ? <div className="py-16 text-center text-sm text-[#6B7280]">Loading inbox…</div> : !inbox ? <EmptyState icon={<MessageCircle size={34} />} title="No conversations yet" description="Your order chats and notices will appear here." /> : (
                        <>
                            {(mode === "global" || (mode === "hotel" && hotelId)) && <div className="bg-[#114B36] text-white rounded-2xl p-4 mb-5"><p className="text-xs font-extrabold uppercase tracking-wider text-white/70">{mode === "global" ? "Platform Notice" : "Hotel Notice"}</p><input value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} placeholder="Optional title" className="mt-3 w-full rounded-xl border-none bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/60 outline-none" /><textarea value={noticeBody} onChange={(event) => setNoticeBody(event.target.value)} placeholder="Share an update with your audience…" rows={3} className="mt-2 w-full resize-none rounded-xl border-none bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/60 outline-none" /><Button size="sm" onClick={() => void publishNotice()} loading={publishing} disabled={!noticeBody.trim()} icon={<Megaphone size={15} />} className="mt-3 !bg-white !text-[#114B36]">Publish {mode === "global" ? "platform" : "hotel"} notice</Button></div>}

                            {/* Search bar */}
                            <div className="relative mb-4"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" /><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search conversations…" className="w-full rounded-2xl border-2 border-[#E5E7EB] bg-white pl-9 pr-4 py-2.5 text-sm outline-none focus:border-[#114B36]" /></div>

                            {/* Category filter tabs */}
                            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-none">
                                {categoryTabs.map((tab) => (
                                    <button key={tab.key} onClick={() => setActiveFilter(tab.key)} className={`flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border-none cursor-pointer transition-colors ${activeFilter === tab.key ? "bg-[#114B36] text-white" : "bg-white border-2 border-[#E5E7EB] text-[#6B7280]"}`}>{tab.icon}{tab.label}</button>
                                ))}
                            </div>

                            {searchQuery.trim() || activeFilter !== "all" ? (
                                filteredConversations.length === 0 ? <EmptyState icon={<Search size={34} />} title="Nothing found" description="Try a different search term or filter." /> : <div className="space-y-2">{filteredConversations.map((item) => renderConversationCard(item.conv))}</div>
                            ) : (
                                <>
                                    {inbox.orderConversations.length > 0 && renderSection("Order Conversations", inbox.orderConversations, "No order messages yet")}
                                    {inbox.talkToStaff.length > 0 && renderSection("Talk to Staff", inbox.talkToStaff, "No support conversations")}
                                    {mode === "hotel" && <div className="mb-6"><div className="flex items-center justify-between mb-3"><h3 className="text-xs font-extrabold uppercase tracking-wider text-[#6B7280]">Community</h3><button onClick={() => setShowCreateChannel(true)} className="flex items-center gap-1 text-xs font-bold text-[#114B36]"><Plus size={14} /> Create channel</button></div>{inbox.communityChannels.length === 0 ? <p className="text-xs text-[#9CA3AF] py-2">No community channels</p> : <div className="space-y-2">{inbox.communityChannels.map(renderConversationCard)}</div>}</div>}
                                    {mode === "customer" && inbox.communityChannels.length > 0 && renderSection("Community", inbox.communityChannels, "")}
                                    {inbox.hotelNotices.length > 0 && renderSection("Hotel Notices", inbox.hotelNotices, "No hotel notices")}
                                    {inbox.platformNotices.length > 0 && renderSection("Platform Notices", inbox.platformNotices, "No platform notices")}
                                    {!inbox.orderConversations.length && !inbox.hotelNotices.length && !inbox.platformNotices.length && !inbox.talkToStaff.length && !inbox.communityChannels.length && (
                                        <EmptyState icon={<MessageCircle size={34} />} title="Your inbox is empty" description="Order chats and announcements will appear here." />
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            ) : (
                <div className="flex flex-col relative" style={{ height: mode === "hotel" ? `calc(${visualHeight ? `${visualHeight}px` : "100dvh"} - 64px - var(--admin-nav-height, calc(72px + env(safe-area-inset-bottom, 0px))))` : `calc(${visualHeight ? `${visualHeight}px` : "100dvh"} - 64px - ${composerSafeArea} - 56px)` }}>
                    <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 px-4 py-5 space-y-3 overflow-y-auto" style={{ overscrollBehaviorY: "contain" }}>
                        <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 flex items-start justify-between gap-2">
                            <div>
                                <p className="text-[0.65rem] font-extrabold uppercase tracking-wider text-[#6B7280]">{selected.type === "ORDER" ? "Order" : selected.type === "HOTEL_NOTICE" ? "Hotel Notice" : selected.type === "PLATFORM_NOTICE" ? "Platform Notice" : selected.type === "TALK_TO_STAFF" ? "Support" : "Channel"}</p>
                                <p className="mt-1 text-sm font-bold text-[#1F2937]">{selected.sourceName || "Conversation"}</p>
                                {selected.sourceContext && <p className="mt-0.5 text-xs text-[#6B7280]">{selected.sourceContext}</p>}
                                {selected.type === "ORDER" && selected.orderInfo && <span className={`inline-block mt-1 text-[0.6rem] font-bold px-1.5 py-1 rounded-full ${selected.orderInfo.status === "DELIVERED" ? "bg-[#D1FAE5] text-[#065F46]" : selected.orderInfo.status === "CANCELLED" ? "bg-[#FEF2F2] text-[#991B1B]" : "bg-[#FEF3C7] text-[#92400E]"}`}>{selected.orderInfo.status}</span>}
                            </div>
                            {!isReadOnly && selected.type !== "TALK_TO_STAFF" && <button onClick={handleDeleteConversation} className="shrink-0 w-8 h-8 rounded-full border-none bg-transparent text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#FEF2F2] flex items-center justify-center cursor-pointer transition-colors" aria-label="Delete conversation"><Trash2 size={15} /></button>}
                        </div>
                        {isReadOnly && <div className="rounded-2xl bg-[#FFF7D6] border border-[#FDE68A] p-4 text-sm text-[#854D0E] flex gap-2"><Info size={17} className="shrink-0 mt-0.5" /> This is a notice. Replies are disabled.</div>}
                        {uniqueById(messages).map((message, index, allMessages) => {
                            const own = ownParticipantIds.has(message.senderParticipantId);
                            const previousOwn = index > 0 && ownParticipantIds.has(allMessages[index - 1]!.senderParticipantId) === own;
                            const nextOwn = index < allMessages.length - 1 && ownParticipantIds.has(allMessages[index + 1]!.senderParticipantId) === own;
                            const recipientRead = own && (selected?.participants || []).filter((participant) => !ownParticipantIds.has(participant.id)).some((participant) => participant.lastReadAt && new Date(participant.lastReadAt).getTime() >= new Date(message.createdAt).getTime());
                            const isEditing = editingMessageId === message.id;
                            const isDeleted = Boolean(message.deletedAt);
                            const replyToMsg = message.replyTo;
                            return <div key={message.id} className={`flex w-full ${own ? "justify-end" : "justify-start"} ${previousOwn ? "mt-0.5" : "mt-3"}`}><div className={`max-w-[82%] px-3.5 py-2.5 shadow-sm ${own ? "bg-[#D9F5E5] text-[#163C2D]" : "bg-white border border-[#E5E7EB] text-[#1F2937]"} ${own ? `${previousOwn ? "rounded-tr-md" : ""} ${nextOwn ? "rounded-br-md" : ""}` : `${previousOwn ? "rounded-tl-md" : ""} ${nextOwn ? "rounded-bl-md" : ""}`} rounded-2xl`}>{isEditing ? <div className="space-y-2"><textarea value={editingBody} onChange={(event) => setEditingBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void saveEditMessage(); } }} className="w-full rounded-xl border-2 border-[#E5E7EB] bg-white px-3 py-2 text-sm outline-none focus:border-[#114B36] resize-none" rows={2} autoFocus /><div className="flex gap-2 justify-end"><button onClick={cancelEditMessage} className="border-none bg-transparent text-[0.65rem] font-bold text-[#6B7280] cursor-pointer px-2 py-1 rounded-lg hover:bg-[#E5E7EB] transition-colors">Cancel</button><button onClick={() => void saveEditMessage()} disabled={!editingBody.trim()} className="border-none bg-[#114B36] text-white text-[0.65rem] font-bold cursor-pointer px-3 py-1 rounded-lg hover:bg-[#0D3D2B] transition-colors disabled:opacity-50">Save</button></div></div> : <>{replyToMsg && <div className="mb-1.5 pl-2 border-l-2 border-[#94CCB5]"><p className="text-[0.55rem] font-bold text-[#5E8271]">Reply</p><p className="text-[0.65rem] text-[#6B7280] truncate">{replyToMsg.body || "Message deleted"}</p></div>}{isDeleted ? <p className="text-sm italic text-[#9CA3AF]">Message deleted</p> : <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>}<div className={`flex items-center justify-end gap-1 mt-1 text-[0.62rem] ${own ? "text-[#5E8271]" : "text-[#9CA3AF]"}`}><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{message.updatedAt && !isDeleted && <span className="text-[0.55rem]">(edited)</span>}{own && !isDeleted && <>{(recipientRead ? <CheckCheck size={14} className="text-[#168AAD]" aria-label="Read" /> : <Check size={14} aria-label="Delivered" />)}<button onClick={() => startEditMessage(message)} className="border-none bg-transparent p-0.5 cursor-pointer hover:opacity-70 transition-opacity" aria-label="Edit message"><Pencil size={11} /></button></>}{!isDeleted && <button onClick={() => { setReplyTo(message); textareaRef.current?.focus(); }} className="border-none bg-transparent p-0.5 cursor-pointer hover:opacity-70 transition-opacity" aria-label="Reply"><Reply size={11} /></button>}{own && !isDeleted && <button onClick={() => void handleDeleteMessage(message.id)} className="border-none bg-transparent p-0.5 cursor-pointer hover:opacity-70 transition-opacity" aria-label="Delete message"><Trash2 size={11} /></button>}</div></>}</div></div>;
                        })}
                        {typing && <TypingBubble />}
                    </div>
                    {!isReadOnly && !isNearBottom && (
                        <div className="absolute right-4 z-30" style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px))" }}>
                            <button onClick={scrollToBottom} className="w-10 h-10 rounded-full bg-[#114B36] text-white shadow-lg flex items-center justify-center border-none cursor-pointer hover:bg-[#0D3D2B] transition-colors" aria-label="Scroll to latest messages"><ChevronDown size={20} /></button>
                        </div>
                    )}
                    {!isReadOnly && (
                        <div className="shrink-0 border-t border-[#DCE9E1] bg-[#F7FBF8]">
                            {replyTo && <div className="flex items-start gap-2 px-3 pt-2 pb-1 bg-[#EBF5F0] border-b border-[#D1E4D8]"><Reply size={13} className="shrink-0 mt-1 text-[#114B36]" /><div className="flex-1 min-w-0"><p className="text-[0.6rem] font-bold text-[#114B36]">Replying</p><p className="text-xs text-[#6B7280] truncate">{replyTo.body || "Message deleted"}</p></div><button onClick={() => setReplyTo(null)} className="shrink-0 w-6 h-6 rounded-full border-none bg-transparent text-[#6B7280] hover:text-[#1F2937] flex items-center justify-center cursor-pointer" aria-label="Cancel reply"><X size={14} /></button></div>}
                            <div className="flex items-end gap-2 p-3">
                                <textarea ref={textareaRef} value={body} onChange={(event) => { setBody(event.target.value); conversationSocket.send({ type: "TYPING_START", conversationId: selected?.id }); if (typingTimer.current) clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => conversationSocket.send({ type: "TYPING_STOP", conversationId: selected?.id }), 1200); }} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send(); } }} onInput={autoResizeTextarea} placeholder={replyTo ? "Write a reply…" : "Write a message…"} aria-label="Message" rows={1} className="min-h-12 max-h-24 min-w-0 flex-1 resize-none rounded-2xl border-2 border-[#CFE1D6] bg-white px-4 py-3 text-sm text-[#1F2937] outline-none transition focus:border-[#114B36] focus:ring-4 focus:ring-[#114B36]/10" />
                                <Button size="sm" onClick={() => void send()} loading={sending} disabled={!body.trim()} icon={<Send size={16} />}>Send</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Error toast */}
            {actionError && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-bold px-4 py-2 rounded-2xl shadow-lg">⚠️ {actionError} <button onClick={() => setActionError("")} className="ml-2 border-none bg-transparent text-white cursor-pointer"><X size={14} /></button></div>}

            {/* Delete message confirmation */}
            <Modal
                isOpen={deleteMessageId !== null}
                onClose={() => setDeleteMessageId(null)}
                type="danger"
                title="Delete this message?"
                message="This action cannot be undone. The message will be removed from the conversation."
                primaryAction={{ label: "Delete", variant: "danger", onClick: () => void confirmDeleteMessage() }}
                secondaryAction={{ label: "Cancel", onClick: () => setDeleteMessageId(null) }}
            />

            {/* Delete conversation confirmation */}
            <Modal
                isOpen={showDeleteConversationModal}
                onClose={() => setShowDeleteConversationModal(false)}
                type="danger"
                title="Delete this entire conversation?"
                message="This action cannot be undone. All messages in this conversation will be permanently removed."
                primaryAction={{ label: "Delete", variant: "danger", onClick: () => void confirmDeleteConversation() }}
                secondaryAction={{ label: "Cancel", onClick: () => setShowDeleteConversationModal(false) }}
            />

            <Modal
                isOpen={showPlatformSupport}
                onClose={() => setShowPlatformSupport(false)}
                type="info"
                title="How can we help?"
                message="This private conversation is visible only to you and Platform Administration."
                primaryAction={{ label: startingSupport ? "Starting…" : "Contact support", loading: startingSupport, disabled: !supportBody.trim(), onClick: () => { if (supportBody.trim()) void startPlatformSupport(); } }}
                secondaryAction={{ label: "Cancel", onClick: () => setShowPlatformSupport(false) }}
            >
                <textarea value={supportBody} onChange={(event) => setSupportBody(event.target.value)} rows={4} placeholder="Describe the problem, what you expected, and what happened…" className="w-full resize-none rounded-2xl border-2 border-[#D7E5DD] bg-[#FBFDFC] px-4 py-3 text-sm text-[#1F2937] outline-none transition focus:border-[#114B36] focus:ring-4 focus:ring-[#114B36]/10" />
            </Modal>

            <Modal
                isOpen={showCreateChannel}
                onClose={() => setShowCreateChannel(false)}
                type="confirm"
                title="Create community channel"
                message="Channels keep hotel staff communication organised. The name becomes a searchable #channel-name."
                primaryAction={{ label: creatingChannel ? "Creating…" : "Create channel", loading: creatingChannel, disabled: !newChannelName.trim(), onClick: async () => { if (!newChannelName.trim() || creatingChannel) return; setCreatingChannel(true); const res = await apiPost("/messaging/community-channels", { hotelId, channelName: newChannelName.trim() }, token); setCreatingChannel(false); if (res.success) { setShowCreateChannel(false); setNewChannelName(""); void loadInbox(); } else setActionError(res.error || "Unable to create channel"); } }}
                secondaryAction={{ label: "Cancel", onClick: () => setShowCreateChannel(false) }}
            >
                <label className="mb-1.5 block text-xs font-bold text-[#374151]" htmlFor="community-channel-name">Channel name</label>
                <input id="community-channel-name" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="e.g. announcements, kitchen" className="w-full rounded-2xl border-2 border-[#D7E5DD] bg-[#FBFDFC] px-4 py-3 text-sm text-[#1F2937] outline-none transition focus:border-[#114B36] focus:ring-4 focus:ring-[#114B36]/10" />
            </Modal>
        </div>
    );
};
