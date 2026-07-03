// Ortak mesajlaşma görünümü — app MessagesScreen birebir (konuşma listesi + sohbet + yeni mesaj).
import { session } from "../store.js";
import { listenConversations, listenMessages, sendMessage, markRead, convIdFor, listArtists, followingList, respondToOffer, getInvitationStatus } from "../data.js";
import { h, clear, icon, empty, spinner, toast, ROLE } from "../ui.js";

// Bir karttan "Mesaj" ile gelinince açılacak hedef ({ otherId, otherName }).
let pending = null;
export function requestChat(target) { pending = target; }

// Rol/emoji tabanlı avatar gradyanı (app getConvColors karşılığı)
const GRADS = { artist: ["#A855F7", "#7C3AED"], venue: ["#F59E0B", "#0A7A9E"], customer: ["#06B6D4", "#0369A1"], organizer: ["#F43F5E", "#BE123C"] };
function msAv(name, size, type, photoUrl) {
  const [a, b] = GRADS[type] || GRADS.customer;
  const style = { width: size + "px", height: size + "px", borderRadius: (size / 2) + "px", fontSize: Math.round(size * 0.42) + "px" };
  // Foto varsa arka plan olarak göster (baş harf yerine)
  if (photoUrl) {
    style.backgroundImage = `url(${photoUrl})`;
    style.backgroundSize = "cover";
    style.backgroundPosition = "center";
    return h("div", { class: "ms-av", style });
  }
  style.background = `linear-gradient(135deg, ${a}, ${b})`;
  return h("div", { class: "ms-av", style }, (name || "?").charAt(0).toLocaleUpperCase("tr-TR"));
}

// Sekmeye monte edilir: messagesView(root, color)
export function messagesView(root, color = ROLE.venue) {
  // Misafir (girişsiz/anonim) → mesajlaşma için giriş gerekir
  if (!session.user || session.guest) {
    clear(root);
    root.append(h("div", { class: "sect" },
      empty("chatbubbles-outline", "Mesajlaşmak için giriş yap", "Sohbet başlatmak ve mesajlarını görmek için bir hesapla giriş yapmalısın."),
      h("div", { class: "cta-row" }, h("a", { class: "btn btn-primary btn-full", href: "#/login" }, icon("log-in-outline", { size: 16 }), h("span", {}, "Giriş Yap")))));
    return;
  }
  let unsub = null;
  const cleanup = () => { if (unsub) { unsub(); unsub = null; } };
  const myType = session.profile?.userType || "customer";

  function showList() {
    cleanup();
    clear(root);
    const listBox = h("div", { class: "ms-list" }, h("div", { class: "loading" }, spinner()));
    root.append(
      h("div", { class: "ms-head" },
        h("div", { class: "grow" },
          h("div", { class: "ms-title" }, "Mesajlar"),
          h("div", { class: "ms-sub" }, session.profile?.displayName || session.profile?.orgName || "")),
        h("button", { class: "ms-compose", title: "Yeni Mesaj", onclick: composeModal }, icon("create-outline", { size: 22, color: "#fff" }))),
      listBox);
    unsub = listenConversations(session.user.uid, (convs) => {
      clear(listBox);
      if (!convs.length) {
        listBox.append(h("div", { class: "ms-empty" }, icon("chatbubbles-outline", { size: 48, color: "var(--text-muted)" }),
          h("div", { class: "ms-empty-t" }, "Henüz mesajınız yok."),
          h("div", { class: "ms-empty-s" }, "Sanatçı veya mekan profilinden mesaj başlatabilirsiniz.")));
        return;
      }
      convs.forEach((c) => listBox.append(convRow(c)));
    });
  }

  function convRow(c) {
    return h("div", { class: "ms-row", onclick: () => showChat(c) },
      msAv(c.otherName, 52, c.isGroup ? "artist" : myType === "venue" ? "artist" : "venue", c.otherPhoto),
      h("div", { class: "grow", style: { minWidth: 0 } },
        h("div", { class: "ms-row-top" },
          h("span", { class: "ms-name" }, c.otherName),
          c.lastMessageTime ? h("span", { class: "ms-time" }, timeShort(c.lastMessageTime)) : null),
        h("div", { class: "ms-row-bot" },
          h("span", { class: "ms-last" }, c.lastMessage || "…"),
          c.unread ? h("span", { class: "ms-unread" }, String(c.unread)) : null)));
  }

  // Yeni Mesaj — mekan: sanatçı ara; diğerleri: takip ettiklerinde ara (app compose)
  async function composeModal() {
    cleanup();
    clear(root);
    let people = [], loaded = false, term = "";
    const listBox = h("div", { class: "ms-list" }, h("div", { class: "loading" }, spinner()));
    const sInp = h("input", { placeholder: myType === "venue" ? "Sanatçı adı veya şehir ara..." : "Takip ettiklerinde ara...", oninput: (e) => { term = e.target.value; draw(); } });
    const draw = () => {
      if (!loaded) return;
      clear(listBox);
      const q = term.trim().toLocaleLowerCase("tr-TR");
      const f = people.filter((p) => !q || (p.name + " " + (p.city || "")).toLocaleLowerCase("tr-TR").includes(q));
      if (!f.length) {
        listBox.append(h("div", { class: "ms-empty-s", style: { paddingTop: "40px", textAlign: "center" } },
          myType === "venue" ? "Sanatçı bulunamadı. Farklı bir isim ya da şehir aratmayı deneyin."
            : "Yalnızca takip ettiğin kullanıcılara mesaj atabilirsin. Profil > Takip Ettiklerim ekranından kullanıcı bulup takip edebilirsin."));
        return;
      }
      f.forEach((p) => listBox.append(h("div", { class: "ms-crow", onclick: () => showChat({ id: convIdFor(session.user.uid, p.id), otherId: p.id, otherName: p.name, isGroup: false }) },
        h("div", { class: "ms-cav" }, (p.name || "?").charAt(0).toLocaleUpperCase("tr-TR")),
        h("div", { class: "grow" }, h("div", { class: "ms-name" }, p.name), h("div", { class: "ms-ctype" }, [p.type, p.city].filter(Boolean).join(" · "))),
        icon("chevron-forward", { size: 20, color: "var(--text-muted)" }))));
    };
    root.append(
      h("div", { class: "ms-head" },
        h("button", { class: "ms-back", onclick: showList }, icon("close", { size: 26, color: "var(--text)" })),
        h("div", { class: "ms-title grow" }, "Yeni Mesaj")),
      h("div", { class: "ms-search" }, icon("search-outline", { size: 16, color: "var(--text-muted)" }), sInp),
      listBox);
    try {
      if (myType === "venue") {
        const arts = await listArtists();
        people = arts.map((a) => ({ id: a.id, name: a.displayName || a.name || "Sanatçı", city: a.city || "", type: "Sanatçı" }));
      } else {
        const fol = await followingList(session.user.uid);
        people = fol.map((f) => ({ id: f.artistId || f.id, name: f.artistName || "Kullanıcı", city: "", type: f.genre || "" }));
      }
    } catch (_) { people = []; }
    loaded = true; draw();
  }

  function showChat(conv) {
    cleanup();
    clear(root);
    const list = h("div", { class: "chat-list" }, h("div", { class: "loading" }, spinner()));
    const input = h("input", { class: "ms-input", placeholder: "Mesaj yazın...", maxlength: 1000, onkeydown: (e) => { if (e.key === "Enter") doSend(); } });
    const sendBtn = h("button", { class: "ms-send", onclick: () => doSend() }, icon("arrow-forward", { size: 20, color: "#fff" }));
    const view = h("div", { class: "chat" },
      h("div", { class: "ms-chathead" },
        h("button", { class: "ms-back", onclick: showList }, icon("chevron-back", { size: 22, color: "var(--text)" })),
        msAv(conv.otherName, 40, conv.isGroup ? "artist" : myType === "venue" ? "artist" : "venue", conv.otherPhoto),
        h("div", {}, h("div", { class: "ms-name" }, conv.otherName), h("div", { class: "ms-status" }, conv.isGroup ? "Grup sohbeti" : "GigBridge"))),
      list,
      h("div", { class: "ms-inputrow" }, input, sendBtn));
    root.append(view);

    const me = session.user.uid;
    unsub = listenMessages(conv.id, (msgs) => {
      clear(list);
      if (!msgs.length) { list.append(h("div", { class: "chat-empty" }, "Sohbeti başlatmak için mesaj gönderin.")); }
      msgs.forEach((m) => list.append(bubble(m, me, conv.isGroup)));
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
    const t = pending; pending = null;
    showChat({ id: convIdFor(session.user.uid, t.otherId), otherId: t.otherId, otherName: t.otherName || "Sohbet", isGroup: false });
  } else {
    showList();
  }
}

function bubble(m, me, isGroup) {
  const mine = m.senderId === me;
  // Teklif mesajı + ben alıcıyım (sanatçı) → Evet/Hayır butonlu kart
  if (m.type === "offer" && !mine && m.invitationId) return offerBubble(m);
  return h("div", { class: "brow " + (mine ? "me" : "them") },
    h("div", { class: "bubble " + (mine ? "b-me" : "b-them") + (m.type === "offer" ? " b-offer" : "") },
      (isGroup && !mine && m.senderName) ? h("div", { class: "ms-sender" }, m.senderName) : null,
      h("div", {}, m.text || ""),
      h("div", { class: "b-time" }, m.createdAt ? timeShort(m.createdAt) : "")));
}

// Sanatçının aldığı sahne teklifi — sohbette Evet/Hayır butonlu kart (kabul → respondToOffer).
function offerBubble(m) {
  const meta = m.offerMeta || {};
  const card = h("div", { class: "bubble b-them offer-card" },
    h("div", { class: "offer-head" }, icon("mail-outline", { size: 13 }), h("span", {}, "Sahne Teklifi")),
    h("div", { class: "offer-text" }, m.text || ""));
  const yes = h("button", { class: "offer-btn yes" }, "Evet");
  const no = h("button", { class: "offer-btn no" }, "Hayır");
  const actions = h("div", { class: "offer-actions" }, yes, no);
  const respond = async (action) => {
    yes.disabled = no.disabled = true; actions.classList.add("busy");
    const status = await getInvitationStatus(m.invitationId);
    if (status && status !== "pending") {
      actions.replaceWith(h("div", { class: "offer-done" }, "Bu teklif zaten yanıtlandı"));
      return;
    }
    try {
      await respondToOffer({ id: m.invitationId, ...meta }, action, { uid: session.user.uid, name: session.profile?.displayName ?? "Sanatçı" });
      actions.replaceWith(h("div", { class: "offer-done " + (action === "accept" ? "ok" : "rej") },
        icon(action === "accept" ? "checkmark-circle" : "close-circle", { size: 15 }),
        h("span", {}, action === "accept" ? "Kabul edildi" : "Reddedildi")));
      toast(action === "accept" ? `${meta.venue || "Mekan"} teklifi kabul edildi ✓` : "Teklif reddedildi", action === "accept" ? "ok" : "err");
    } catch (e) {
      yes.disabled = no.disabled = false; actions.classList.remove("busy");
      toast("İşlem başarısız, tekrar dene", "err");
    }
  };
  yes.onclick = () => respond("accept");
  no.onclick = () => respond("reject");
  card.append(actions, h("div", { class: "b-time" }, m.createdAt ? timeShort(m.createdAt) : ""));
  return h("div", { class: "brow them" }, card);
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
