// Ortak mesajlaşma görünümü — konuşma listesi + sohbet (app conversations/messages şeması).
import { session } from "../store.js";
import { listenConversations, listenMessages, sendMessage, markRead, convIdFor } from "../data.js";
import { h, clear, icon, avatar, empty, spinner, toast, fmtDate, ROLE } from "../ui.js";

// Bir karttan "Mesaj" ile gelinince açılacak hedef ({ otherId, otherName }).
let pending = null;
export function requestChat(target) { pending = target; }

// Sekmeye monte edilir: messagesView(root, color)
export function messagesView(root, color = ROLE.venue) {
  let unsub = null;
  const cleanup = () => { if (unsub) { unsub(); unsub = null; } };

  let openedPending = false;
  function showList() {
    cleanup();
    clear(root);
    const listBox = h("div", { class: "list-card" }, h("div", { class: "loading" }, spinner()));
    root.append(h("div", { class: "sect" }, h("h2", { class: "sect-title" }, icon("chatbubbles-outline", { size: 16 }), " Konuşmalar")), listBox);
    unsub = listenConversations(session.user.uid, (convs) => {
      clear(listBox);
      if (!convs.length) { listBox.append(empty("chatbubbles-outline", "Henüz mesaj yok", "Organizatör/mekan istekleri üzerinden ya da uygulamadan sohbet başlatabilirsin.")); return; }
      convs.forEach((c) => listBox.append(convRow(c)));
    });
  }

  function convRow(c) {
    return h("div", { class: "lrow clickable", onclick: () => showChat(c) },
      avatar(c.otherName, color),
      h("div", { class: "lrow-info" },
        h("div", { class: "lrow-name" }, c.otherName),
        h("div", { class: "lrow-meta ellipsis" }, c.lastMessage || "…")),
      h("div", { class: "conv-side" },
        c.lastMessageTime ? h("span", { class: "conv-time" }, timeShort(c.lastMessageTime)) : null,
        c.unread ? h("span", { class: "unread" }, c.unread) : null));
  }

  function showChat(conv) {
    cleanup();
    clear(root);
    const list = h("div", { class: "chat-list" }, h("div", { class: "loading" }, spinner()));
    const input = h("input", { class: "chat-input", placeholder: "Mesaj yaz…", onkeydown: (e) => { if (e.key === "Enter") doSend(); } });
    const sendBtn = h("button", { class: "chat-send", onclick: () => doSend() }, icon("send", { size: 18 }));
    const view = h("div", { class: "chat" },
      h("div", { class: "chat-head" },
        h("button", { class: "icon-btn", onclick: showList }, icon("chevron-back", { size: 20 })),
        avatar(conv.otherName, color),
        h("div", {}, h("div", { class: "chat-name" }, conv.otherName), h("div", { class: "chat-sub" }, "GigBridge"))),
      list,
      h("div", { class: "chat-inputrow" }, input, sendBtn));
    root.append(view);

    const me = session.user.uid;
    unsub = listenMessages(conv.id, (msgs) => {
      clear(list);
      if (!msgs.length) { list.append(h("div", { class: "chat-empty" }, "Sohbeti başlatmak için mesaj yaz.")); }
      msgs.forEach((m) => list.append(bubble(m, me)));
      list.scrollTop = list.scrollHeight;
    });
    markRead(conv.id, me);

    async function doSend() {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      try {
        await sendMessage({
          fromId: me, fromName: session.profile?.displayName || session.profile?.orgName || "Ben",
          fromType: session.profile?.userType, toId: conv.otherId, toName: conv.otherName,
          text, convId: conv.id || undefined, isGroup: conv.isGroup,
        });
      } catch (e) { toast("Mesaj gönderilemedi", "err"); input.value = text; }
    }
  }

  // Bir karttan "Mesaj" ile gelindiyse doğrudan o sohbeti aç; yoksa listeyi göster.
  if (pending && pending.otherId) {
    const t = pending; pending = null; openedPending = true;
    showChat({ id: convIdFor(session.user.uid, t.otherId), otherId: t.otherId, otherName: t.otherName || "Sohbet", isGroup: false });
  } else {
    showList();
  }
}

function bubble(m, me) {
  const mine = m.senderId === me;
  return h("div", { class: "brow " + (mine ? "me" : "them") },
    h("div", { class: "bubble " + (mine ? "b-me" : "b-them") },
      h("div", {}, m.text || ""),
      h("div", { class: "b-time" }, m.createdAt ? timeShort(m.createdAt) : "")));
}

function timeShort(v) {
  try {
    const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
    if (isNaN(d)) return "";
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  } catch { return ""; }
}
