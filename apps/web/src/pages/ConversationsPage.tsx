import React, { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, ChevronDown, Megaphone, Plus, Users, UserPlus, X, Check, CheckCheck, Pencil, Trash2, Reply } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../lib/api";
import { Header } from "../components/ui/Header";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";

interface Conversation {
  id: string;
  type: string;
  title?: string | null;
  lastMessageAt?: string | null;
  participants?: { id: string; kind: string; customerId?: string | null; guestIdentityId?: string | null; adminUserId?: string | null; platformAdminId?: string | null; lastReadAt?: string | null }[];
  messages?: { id: string; body: string; createdAt: string; senderParticipantId: string }[];
  unreadCount?: number;
  sourceName?: string;
  sourceKind?: string;
  sourceContext?: string;
}
interface Message { id: string; conversationId?: string; body: string; createdAt: string; updatedAt?: string | null; deletedAt?: string | null; replyToId?: string | null; replyTo?: { body: string; deletedAt: string | null; senderParticipantId: string } | null; senderParticipantId: string; }
type NewConversationCategory = "DIRECT" | "GROUP" | "SUPPORT" | "HOTEL_ANNOUNCEMENT" | "GLOBAL_ANNOUNCEMENT";

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function newestFirst(items: Conversation[]): Conversation[] {
  return [...items].sort((a, b) => new Date(b.lastMessageAt || b.messages?.[0]?.createdAt || 0).getTime() - new Date(a.lastMessageAt || a.messages?.[0]?.createdAt || 0).getTime());
}

const TypingDots: React.FC = () => <span className="inline-flex items-center gap-1" aria-label="Typing"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "currentColor", animation: "typingBounce 1.2s infinite", animationDelay: "-0.4s" }} /><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "currentColor", animation: "typingBounce 1.2s infinite", animationDelay: "-0.2s" }} /><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "currentColor", animation: "typingBounce 1.2s infinite", animationDelay: "0s" }} /></span>;

const TypingBubble: React.FC = () => <div className="flex justify-start" aria-live="polite"><div className="rounded-2xl rounded-bl-md border border-[#E5E7EB] bg-white px-4 py-3 text-[#6B7280] shadow-sm"><TypingDots /></div></div>;

export const ConversationsPage: React.FC<{ token?: string; actorId?: string; onBack: () => void; title?: string; mode?: "customer" | "hotel" | "global"; hotelId?: string }> = ({ token, actorId, onBack, title = "Conversations", mode = "customer", hotelId }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creatingSupport, setCreatingSupport] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryResults, setDirectoryResults] = useState<any[]>([]);
  const [discoverable, setDiscoverable] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newCategory, setNewCategory] = useState<NewConversationCategory | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [discoverabilitySaving, setDiscoverabilitySaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [typing, setTyping] = useState(false);
  const [typingByConversation, setTypingByConversation] = useState<Record<string, boolean>>({});
  const [presence, setPresence] = useState<Record<string, { online: boolean; lastActiveAt: number | null }>>({});
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const canAnnounce = mode === "hotel" || mode === "global";
  const isAnnouncement = selected?.type.includes("ANNOUNCEMENT");
  const ownParticipantIds = useMemo(() => new Set((selected?.participants || []).filter((participant) => actorId ? (mode === "customer" ? participant.customerId === actorId : participant.adminUserId === actorId) : mode === "customer" ? participant.kind === "GUEST" : false).map((participant) => participant.id)), [selected?.participants, actorId, mode]);
  const categories = useMemo(() => {
    if (mode === "customer") return [
      { type: "DIRECT" as const, label: "Chat with a person", description: "Start a private conversation with someone discoverable.", icon: UserPlus },
      { type: "SUPPORT" as const, label: "Contact support", description: "Get help from Ladha Delivery Support.", icon: MessageCircle },
    ];
    if (mode === "hotel") return [
      { type: "DIRECT" as const, label: "Direct staff chat", description: "Message one member of your hotel team.", icon: UserPlus },
      { type: "GROUP" as const, label: "Hotel group chat", description: "Create a team conversation for selected staff.", icon: Users },
      { type: "SUPPORT" as const, label: "Contact support", description: "Get help from Ladha Delivery Support.", icon: MessageCircle },
      { type: "HOTEL_ANNOUNCEMENT" as const, label: "Hotel announcement", description: "Publish an update to your hotel audience.", icon: Megaphone },
    ];
    return [{ type: "GLOBAL_ANNOUNCEMENT" as const, label: "Platform announcement", description: "Publish an update across Ladha Deliveries.", icon: Megaphone }];
  }, [mode]);

  const loadConversations = async () => {
    const result = await apiGet<Conversation[]>("/messaging/conversations", token);
    if (result.success && result.data) setConversations(newestFirst(uniqueById(result.data)));
    setLoading(false);
  };

  const openConversation = async (conversation: Conversation) => {
    setSelected(conversation);
    const result = await apiGet<{ messages: Message[] }>(`/messaging/conversations/${conversation.id}/messages`, token);
    if (result.success && result.data) setMessages(uniqueById(result.data.messages));
    const readResult = await apiPost<{ id: string; lastReadAt: string }>(`/messaging/conversations/${conversation.id}/read`, {}, token);
    if (readResult.success && readResult.data) setSelected((current) => current ? { ...current, participants: current.participants?.map((participant) => participant.id === readResult.data!.id ? { ...participant, lastReadAt: readResult.data!.lastReadAt } : participant) } : current);
    setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, unreadCount: 0 } : item));
  };

  const conversationSocket = { send: (payload: unknown) => window.dispatchEvent(new CustomEvent("tabledash:send", { detail: payload })) };

  useEffect(() => {
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string; payload: any }>).detail;
      if (detail.type === "MESSAGE_CREATED") {
        const message = detail.payload as Message;
        if (selected?.id === message.conversationId) {
          setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
          // A participant already viewing the chat has seen the message.
          // Persist and broadcast that read state immediately.
          void apiPost<{ id: string; lastReadAt: string }>(`/messaging/conversations/${message.conversationId}/read`, {}, token).then((result) => {
            if (result.success && result.data) setSelected((current) => current ? { ...current, participants: current.participants?.map((participant) => participant.id === result.data!.id ? { ...participant, lastReadAt: result.data!.lastReadAt } : participant) } : current);
          });
        }
        setConversations((current) => newestFirst(current.map((conversation) => conversation.id !== message.conversationId ? conversation : { ...conversation, lastMessageAt: message.createdAt, messages: [{ id: message.id, body: message.body, createdAt: message.createdAt, senderParticipantId: message.senderParticipantId }], unreadCount: selected?.id === message.conversationId ? 0 : Math.max(1, conversation.unreadCount || 0) })));
      }
      if (detail.type === "CONVERSATION_CREATED") {
        const conversation = detail.payload as Conversation;
        setConversations((current) => newestFirst([conversation, ...current.filter((item) => item.id !== conversation.id)]));
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
        if (selected?.id === updated.conversationId) {
          setMessages((current) => current.map((msg) => msg.id === updated.id ? updated : msg));
        }
      }
    };
    window.addEventListener("tabledash:realtime", handleRealtime);
    return () => window.removeEventListener("tabledash:realtime", handleRealtime);
  }, [selected?.id, token]);

  useEffect(() => {
    void loadConversations();
    if (token) void apiGet<{ isDiscoverable: boolean }>("/messaging/discoverability", token).then((result) => { if (result.success) setDiscoverable(Boolean(result.data?.isDiscoverable)); });
  }, [token]);

  useEffect(() => { void loadDirectory(); }, [discoverable, token]);
  useEffect(() => { setTyping(Boolean(selected?.id && typingByConversation[selected.id])); }, [selected?.id, typingByConversation]);

  // Inject typing bounce keyframes once
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

  // Auto-scroll when new messages arrive or typing indicator appears, but only if near bottom
  useEffect(() => {
    if (isNearBottom) scrollToBottom();
  }, [messages, typing, isNearBottom]);

  // Reset scroll position when opening a new conversation
  useEffect(() => {
    setBody("");
    setIsNearBottom(true);
  }, [selected?.id]);

  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const startEditMessage = (message: Message) => {
    setEditingMessageId(message.id);
    setEditingBody(message.body);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingBody("");
  };

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
    if (!window.confirm("Delete this message?")) return;
    const result = await apiDelete(`/messaging/conversations/${selected.id}/messages/${messageId}`, token);
    if (result.success) {
      setMessages((current) => current.filter((msg) => msg.id !== messageId));
    } else setActionError(result.error || "Unable to delete message");
  };

  const handleDeleteConversation = async () => {
    if (!selected) return;
    if (!window.confirm("Delete this entire conversation?")) return;
    const result = await apiDelete(`/messaging/conversations/${selected.id}`, token);
    if (result.success) {
      setSelected(null);
      setMessages([]);
      void loadConversations();
    } else setActionError(result.error || "Unable to delete conversation");
  };

  const send = async () => {
    if (!selected || !body.trim() || sending || isAnnouncement) return;
    conversationSocket.send({ type: "TYPING_STOP", conversationId: selected.id });
    setSending(true);
    const result = await apiPost<Message>(`/messaging/conversations/${selected.id}/messages`, { body: body.trim(), replyToId: replyTo?.id || undefined }, token);
    if (result.success && result.data) {
      setMessages((current) => current.some((message) => message.id === result.data!.id) ? current : [...current, result.data!]);
      setBody("");
      setReplyTo(null);
      void loadConversations();
    }
    else setActionError(result.error || "Unable to open support right now.");
    setSending(false);
  };

  const startSupport = async () => {
    if (creatingSupport) return;
    setCreatingSupport(true);
    const result = await apiPost<Conversation>("/messaging/conversations", { type: "SUPPORT", title: "Ladha Delivery Support" }, token);
    if (result.success && result.data) {
      setConversations((current) => [result.data!, ...current.filter((item) => item.id !== result.data!.id)]);
      await openConversation(result.data);
    }
    setCreatingSupport(false);
  };

  const searchDirectory = async (query: string) => {
    setDirectoryQuery(query);
    if (query.trim().length < 2) { setDirectoryResults([]); return; }
    const result = await apiGet<any[]>(`/messaging/directory?q=${encodeURIComponent(query.trim())}`, token);
    if (result.success && result.data) {
      setDirectoryResults(result.data);
      setPresence(Object.fromEntries(result.data.map((person) => [person.id, person.presence])));
    }
  };

  const loadDirectory = async () => {
    if (!token || !discoverable) return;
    const result = await apiGet<any[]>("/messaging/directory", token);
    if (result.success && result.data) {
      setDirectoryResults(result.data);
      setPresence(Object.fromEntries(result.data.map((person) => [person.id, person.presence])));
    }
  };

  const setDiscoverability = async (nextValue: boolean) => {
    if (discoverabilitySaving) return;
    setDiscoverabilitySaving(true);
    setActionError("");
    const result = await apiPatch<{ isDiscoverable: boolean }>("/messaging/discoverability", { discoverable: nextValue }, token);
    if (result.success) setDiscoverable(Boolean(result.data?.isDiscoverable));
    else setActionError(result.error || "Unable to update discoverability.");
    setDiscoverabilitySaving(false);
  };

  const startDirectChat = async (person: any) => {
    const isCustomer = Boolean(person.firstName);
    const result = await apiPost<Conversation>("/messaging/conversations", { type: "DIRECT", ...(isCustomer ? { targetCustomerId: person.id } : { targetAdminUserId: person.id }), title: person.knownName || person.name || `${person.firstName} ${person.lastName || ""}`.trim() }, token);
    if (result.success && result.data) {
      setConversations((current) => [result.data!, ...current.filter((item) => item.id !== result.data!.id)]);
      setDirectoryResults([]);
      setDirectoryQuery("");
      await openConversation(result.data);
    } else setActionError(result.error || "Unable to start this conversation.");
  };

  const publishAnnouncement = async () => {
    if (!announcementBody.trim() || publishing) return;
    setPublishing(true);
    const result = await apiPost("/messaging/announcements", { type: mode === "global" ? "GLOBAL_ANNOUNCEMENT" : "HOTEL_ANNOUNCEMENT", hotelId: mode === "hotel" ? hotelId : undefined, title: announcementTitle.trim() || undefined, body: announcementBody.trim() }, token);
    if (result.success) { setAnnouncementTitle(""); setAnnouncementBody(""); await loadConversations(); }
    else setActionError(result.error || "Unable to publish this announcement.");
    setPublishing(false);
  };

  const openNewConversation = () => {
    setActionError("");
    setNewCategory(null);
    setSelectedRecipients([]);
    setNewConversationOpen(true);
  };

  const closeNewConversation = () => {
    if (publishing || sending) return;
    setNewConversationOpen(false);
    setNewCategory(null);
    setSelectedRecipients([]);
    setAnnouncementTitle("");
    setAnnouncementBody("");
  };

  const toggleRecipient = (id: string) => {
    setSelectedRecipients((current) => newCategory === "DIRECT"
      ? (current.includes(id) ? [] : [id])
      : current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const createFromComposer = async () => {
    if (!newCategory) return;
    setActionError("");
    if (newCategory === "SUPPORT") {
      closeNewConversation();
      await startSupport();
      return;
    }
    if (newCategory === "HOTEL_ANNOUNCEMENT" || newCategory === "GLOBAL_ANNOUNCEMENT") {
      if (!announcementBody.trim()) { setActionError("Add a message before publishing the announcement."); return; }
      setPublishing(true);
      const result = await apiPost("/messaging/announcements", { type: newCategory, hotelId: newCategory === "HOTEL_ANNOUNCEMENT" ? hotelId : undefined, title: announcementTitle.trim() || undefined, body: announcementBody.trim() }, token);
      setPublishing(false);
      if (!result.success) { setActionError(result.error || "Unable to publish this announcement."); return; }
      closeNewConversation();
      await loadConversations();
      return;
    }
    if (!selectedRecipients.length) { setActionError(newCategory === "GROUP" ? "Choose at least one staff member." : "Choose a person to message."); return; }
    setSending(true);
    const recipient = directoryResults.find((person) => person.id === selectedRecipients[0]);
    const result = await apiPost<Conversation>("/messaging/conversations", {
      type: newCategory,
      hotelId: mode === "hotel" ? hotelId : undefined,
      title: newCategory === "GROUP" ? (announcementTitle.trim() || "Hotel team") : (recipient?.knownName || recipient?.name || `${recipient?.firstName || ""} ${recipient?.lastName || ""}`.trim()),
      ...(newCategory === "GROUP" ? { adminUserIds: selectedRecipients } : recipient?.firstName ? { targetCustomerId: recipient.id } : { targetAdminUserId: recipient?.id }),
    }, token);
    setSending(false);
    if (!result.success || !result.data) { setActionError(result.error || "Unable to start this conversation."); return; }
    closeNewConversation();
    setConversations((current) => [result.data!, ...current.filter((item) => item.id !== result.data!.id)]);
    await openConversation(result.data);
  };

  const subtitle = useMemo(() => selected?.sourceContext || (selected?.type === "GLOBAL_ANNOUNCEMENT" ? "Platform announcement" : selected?.type === "HOTEL_ANNOUNCEMENT" ? "Hotel announcement" : selected?.type === "SUPPORT" ? "Support conversation for this account" : "Ladha Conversations"), [selected]);
  const selectedTitle = selected?.type === "SUPPORT" ? "Ladha Delivery Support" : selected?.type === "DIRECT" ? (selected?.sourceName || selected?.title || subtitle) : selected?.title || subtitle;

  return (
    <div className="app-container">
      <Header title={selected ? selectedTitle : title} subtitle={selected ? subtitle : "Messages, updates and support"} onBack={selected ? () => setSelected(null) : onBack} />
      {!selected ? (
        <div className="px-4 py-5">
          <div className="flex items-center justify-between mb-5">
            <div><p className="text-xs font-bold uppercase tracking-wider text-[#114B36]">Ladha Conversations</p><h2 className="text-2xl font-black text-[#1F2937]">Stay in the loop</h2></div>
            <button onClick={openNewConversation} aria-label="New conversation" className="w-11 h-11 rounded-2xl bg-[#114B36] text-white border-none flex items-center justify-center cursor-pointer shadow-sm"><Plus size={22} /></button>
          </div>
          {newConversationOpen && <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="new-conversation-title">
            <div className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#FFF8F0] p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-[#114B36]">Start something new</p><h3 id="new-conversation-title" className="text-xl font-black text-[#1F2937]">New conversation</h3></div><button onClick={closeNewConversation} aria-label="Close" className="w-9 h-9 rounded-full border-none bg-white text-[#6B7280] flex items-center justify-center cursor-pointer"><X size={18} /></button></div>
              {!newCategory ? <div className="space-y-2">{categories.map(({ type, label, description, icon: Icon }) => <button key={type} onClick={() => setNewCategory(type)} className="w-full flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left cursor-pointer hover:border-[#94CCB5]"><span className="w-10 h-10 rounded-xl bg-[#EBF5F0] text-[#114B36] flex items-center justify-center"><Icon size={19} /></span><span className="min-w-0"><span className="block font-bold text-[#1F2937]">{label}</span><span className="block text-xs text-[#6B7280] mt-1">{description}</span></span></button>)}</div> : <div>
                <button onClick={() => { setNewCategory(null); setSelectedRecipients([]); }} className="mb-4 border-none bg-transparent text-xs font-bold text-[#114B36] cursor-pointer">← Choose another category</button>
                {(newCategory === "DIRECT" || newCategory === "GROUP") && <><p className="text-sm font-bold text-[#1F2937] mb-2">{newCategory === "GROUP" ? "Choose staff members" : "Choose a person"}</p>{newCategory === "GROUP" && <input value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} placeholder="Group name (optional)" className="w-full mb-3 rounded-xl border-2 border-[#E5E7EB] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#114B36]" />}{!discoverable && mode === "customer" ? <p className="rounded-xl bg-[#FFF7D6] p-3 text-xs text-[#854D0E]">Enable discovery first to find other users.</p> : directoryResults.length === 0 ? <p className="rounded-xl bg-white p-3 text-xs text-[#6B7280]">No eligible people are available yet.</p> : <div className="space-y-1">{directoryResults.map((person) => { const name = person.knownName || person.name || `${person.firstName || ""} ${person.lastName || ""}`.trim(); return <label key={person.id} className="flex items-center gap-3 rounded-xl bg-white p-3 cursor-pointer"><input type={newCategory === "GROUP" ? "checkbox" : "radio"} name="conversation-recipient" checked={selectedRecipients.includes(person.id)} onChange={() => toggleRecipient(person.id)} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#1F2937] truncate">{name}</span><span className="block text-xs text-[#6B7280]">{person.presence?.online ? "Online" : "Available to chat"}</span></span></label>; })}</div>}</>}
                {newCategory === "SUPPORT" && <div className="rounded-2xl bg-white p-4 text-sm text-[#4B5563]">A private support conversation will be opened with Ladha Delivery Support.</div>}
                {(newCategory === "HOTEL_ANNOUNCEMENT" || newCategory === "GLOBAL_ANNOUNCEMENT") && <><p className="text-sm font-bold text-[#1F2937] mb-2">{newCategory === "GLOBAL_ANNOUNCEMENT" ? "Platform announcement" : "Hotel announcement"}</p><input value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} placeholder="Optional title" className="w-full rounded-xl border-2 border-[#E5E7EB] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#114B36]" /><textarea value={announcementBody} onChange={(event) => setAnnouncementBody(event.target.value)} placeholder="Write your announcement…" rows={5} className="mt-2 w-full resize-none rounded-xl border-2 border-[#E5E7EB] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#114B36]" /></>}
                {actionError && <p role="alert" className="mt-3 rounded-xl bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">{actionError}</p>}
                <Button onClick={() => void createFromComposer()} loading={publishing || sending} disabled={(newCategory === "DIRECT" || newCategory === "GROUP") ? !selectedRecipients.length : newCategory === "SUPPORT" ? false : !announcementBody.trim()} className="w-full mt-4">{newCategory === "GLOBAL_ANNOUNCEMENT" || newCategory === "HOTEL_ANNOUNCEMENT" ? "Publish announcement" : newCategory === "GROUP" ? "Create group" : newCategory === "SUPPORT" ? "Open support" : "Start chat"}</Button>
              </div>}
            </div>
          </div>}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 mb-5">
            <div className="flex items-start justify-between gap-3 mb-3"><div><h3 className="font-bold text-[#1F2937]">Find people</h3><p className="text-xs text-[#6B7280] mt-1">{mode === "customer" ? "Discoverable customers across Ladha appear here." : mode === "hotel" ? "Discoverable staff from your hotel appear here." : "Discoverable platform administrators appear here."}</p></div>{!token ? <span className="text-xs font-semibold text-[#9CA3AF]">Sign in to enable</span> : <button onClick={() => void setDiscoverability(!discoverable)} disabled={discoverabilitySaving} className="shrink-0 rounded-xl bg-[#EBF5F0] text-[#114B36] border-none px-3 py-2 text-xs font-bold cursor-pointer disabled:opacity-50">{discoverabilitySaving ? "Saving…" : discoverable ? "Hide me" : "Enable discovery"}</button>}</div>
            {actionError && <p role="alert" className="mb-3 rounded-xl bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">{actionError}</p>}
            {discoverable && <input value={directoryQuery} onChange={(event) => void searchDirectory(event.target.value)} placeholder="Search by name or known name" aria-label="Search users" className="w-full rounded-xl border-2 border-[#E5E7EB] bg-[#FFF8F0] px-3 py-2.5 text-sm outline-none focus:border-[#114B36]" />}
            {discoverable && <div className="mt-2 space-y-1">{directoryResults.length === 0 ? <p className="text-xs text-[#9CA3AF] py-2">No discoverable users found yet.</p> : directoryResults.map((person) => <button key={person.id} onClick={() => void startDirectChat(person)} className="w-full flex items-center gap-3 text-left rounded-xl px-3 py-2 hover:bg-[#EBF5F0] border-none bg-transparent cursor-pointer"><span className={`w-2.5 h-2.5 rounded-full shrink-0 ${presence[person.id]?.online ? "bg-[#22C55E]" : "bg-[#D1D5DB]"}`} /><span className="min-w-0 flex-1"><span className="block font-semibold text-sm text-[#1F2937] truncate">{person.knownName || person.name || `${person.firstName} ${person.lastName || ""}`.trim()}</span><span className="block text-xs text-[#6B7280]">{presence[person.id]?.online ? "Online" : presence[person.id]?.lastActiveAt ? `Last active ${new Date(presence[person.id].lastActiveAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Available to chat"}</span></span></button>)}</div>}
          </div>
          {canAnnounce && <div className="bg-[#114B36] text-white rounded-2xl p-4 mb-5"><p className="text-xs font-extrabold uppercase tracking-wider text-white/70">{mode === "global" ? "Platform announcement" : "Hotel announcement"}</p><input value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} placeholder="Optional title" className="mt-3 w-full rounded-xl border-none bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/60 outline-none" /><textarea value={announcementBody} onChange={(event) => setAnnouncementBody(event.target.value)} placeholder="Share an update with your audience…" rows={3} className="mt-2 w-full resize-none rounded-xl border-none bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/60 outline-none" /><Button size="sm" onClick={() => void publishAnnouncement()} loading={publishing} disabled={!announcementBody.trim()} icon={<Megaphone size={15} />} className="mt-3 !bg-white !text-[#114B36]">Publish announcement</Button></div>}
          {loading ? <div className="py-16 text-center text-sm text-[#6B7280]">Loading conversations…</div> : conversations.length === 0 ? <EmptyState icon={<MessageCircle size={34} />} title="No conversations yet" description="Your hotel updates and support chats will appear here." action={{ label: creatingSupport ? "Opening support…" : "Contact support", onClick: () => void startSupport() }} /> : (
            <div className="space-y-2">
              {uniqueById(conversations).map((conversation) => {
                const latest = conversation.messages?.[0];
                const announcement = conversation.type.includes("ANNOUNCEMENT");
                return <button key={conversation.id} onClick={() => void openConversation(conversation)} className="w-full flex items-center gap-3 text-left bg-white border border-[#E5E7EB] rounded-2xl p-4 hover:border-[#94CCB5] transition-colors">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center ${announcement ? "bg-[#FFF7D6] text-[#A16207]" : "bg-[#EBF5F0] text-[#114B36]"}`}>{announcement ? <Megaphone size={19} /> : <MessageCircle size={19} />}</div>
                  <div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><span className="font-bold text-[#1F2937] truncate">{conversation.type === "SUPPORT" ? "Ladha Delivery Support" : conversation.type === "DIRECT" ? (conversation.sourceName || conversation.title || "Conversation") : conversation.title || (announcement ? "Announcement" : "Conversation")}</span><span className="text-[0.65rem] text-[#9CA3AF]">{latest ? new Date(latest.createdAt).toLocaleDateString() : ""}</span></div>{conversation.sourceName && <p className="text-[0.65rem] font-semibold text-[#A16207] mt-1">{conversation.sourceName} · {conversation.sourceKind}</p>}{typingByConversation[conversation.id] ? <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#114B36]"><TypingDots /> <span>typing…</span></p> : <p className="text-sm text-[#6B7280] truncate mt-1">{latest?.body || "No messages yet"}</p>}</div>
                  {Boolean(conversation.unreadCount) && <span className="min-w-5 h-5 rounded-full bg-[#22C55E] text-white text-[0.65rem] font-bold flex items-center justify-center px-1">{conversation.unreadCount! > 99 ? "99+" : conversation.unreadCount}</span>}
                </button>;
              })}
            </div>
          )}
        </div>
      ) : (
        <div
          className="flex flex-col relative"
          style={{ height: `calc(100dvh - 64px - ${mode === "hotel" ? 72 : 56}px)` }}
        >
          <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 px-4 py-5 space-y-3 overflow-y-auto">
            <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 flex items-start justify-between gap-2"><div><p className="text-[0.65rem] font-extrabold uppercase tracking-wider text-[#6B7280]">Source</p><p className="mt-1 text-sm font-bold text-[#1F2937]">{selected.sourceName || (selected.type === "SUPPORT" ? "Ladha Delivery Support" : selected.type === "GLOBAL_ANNOUNCEMENT" ? "Platform Administration" : "Ladha Conversations")}</p><p className="mt-0.5 text-xs text-[#6B7280]">{selected.sourceContext || (selected.type === "SUPPORT" ? "Support conversation for this account" : "Conversation participants only")}</p></div>{!isAnnouncement && !selected.type.includes("SUPPORT") && <button onClick={handleDeleteConversation} className="shrink-0 w-8 h-8 rounded-full border-none bg-transparent text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#FEF2F2] flex items-center justify-center cursor-pointer transition-colors" aria-label="Delete conversation"><Trash2 size={15} /></button>}</div>
            {isAnnouncement && <div className="rounded-2xl bg-[#FFF7D6] border border-[#FDE68A] p-4 text-sm text-[#854D0E] flex gap-2"><Megaphone size={17} className="shrink-0 mt-0.5" /> This is an announcement. Replies are disabled.</div>}
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
          {!isAnnouncement && !isNearBottom && (
            <div className="absolute right-4 z-30" style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px))" }}>
              <button onClick={scrollToBottom} className="w-10 h-10 rounded-full bg-[#114B36] text-white shadow-lg flex items-center justify-center border-none cursor-pointer hover:bg-[#0D3D2B] transition-colors" aria-label="Scroll to latest messages">
                <ChevronDown size={20} />
              </button>
            </div>
          )}
          {!isAnnouncement && (
            <div className="shrink-0 bg-[#FFF8F0] border-t border-[#E5E7EB]">
              {replyTo && (
                <div className="flex items-start gap-2 px-3 pt-2 pb-1 bg-[#EBF5F0] border-b border-[#D1E4D8]">
                  <Reply size={13} className="shrink-0 mt-1 text-[#114B36]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.6rem] font-bold text-[#114B36]">Replying</p>
                    <p className="text-xs text-[#6B7280] truncate">{replyTo.body || "Message deleted"}</p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="shrink-0 w-6 h-6 rounded-full border-none bg-transparent text-[#6B7280] hover:text-[#1F2937] flex items-center justify-center cursor-pointer" aria-label="Cancel reply"><X size={14} /></button>
                </div>
              )}
              <div className="p-3 flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value);
                    conversationSocket.send({ type: "TYPING_START", conversationId: selected?.id });
                    if (typingTimer.current) clearTimeout(typingTimer.current);
                    typingTimer.current = setTimeout(() => conversationSocket.send({ type: "TYPING_STOP", conversationId: selected?.id }), 1200);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  onInput={autoResizeTextarea}
                  placeholder={replyTo ? "Write a reply…" : "Write a message…"}
                  aria-label="Message"
                  rows={1}
                  className="flex-1 min-w-0 rounded-2xl border-2 border-[#E5E7EB] bg-white px-4 py-3 outline-none focus:border-[#114B36] resize-none max-h-32"
                />
                <Button size="sm" onClick={() => void send()} loading={sending} disabled={!body.trim()} icon={<Send size={16} />}>Send</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
