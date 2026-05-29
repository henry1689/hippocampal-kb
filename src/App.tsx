import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage } from './components/ChatMessage';
import { LoadingScreen } from './components/LoadingScreen';
import { NineDRadar } from './components/NineDRadar';
import { KeywordGraph } from './components/KeywordGraph';
import { MemoryLog } from './components/MemoryLog';
import { SceneReconstruction } from './components/SceneReconstruction';
import { Timeline } from './components/Timeline';
import { searchEngine } from './engine/SearchEngine';
import type { Memory as PresetMemory } from './types';

interface ChatMemory {
  id: string;
  title: string;
  text: string;
  userInput?: string;  // 用户原始输入
  nineD: any;
  tags?: string[];
  timestamp: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

function toPresetMemory(cm: ChatMemory): PresetMemory {
  const n = cm.nineD || {};
  const ts = cm.timestamp || Date.now();
  return {
    id: cm.id,
    scenarioId: 'chat',
    momentIndex: 0,
    title: cm.title || '聊天记忆',
    text: cm.text || '',
    embedding: [],
    timestamp: ts,
    nineD: {
      X_semantic: n.X_semantic || { keywords: [], topics: [] },
      Y_time: n.Y_time || { absolute: ts, season: '', dayNight: '', hour: new Date(ts).getHours() },
      Z_emotion: n.Z_emotion || { vector: { valence: 0, arousal: 0 }, intensity: 0.5, primaryType: 'neutral' },
      W_who: n.W_who || [],
      V_venue: n.V_venue || { type: 'chat', environment: 'indoor', lighting: 'unknown', atmosphere: 'casual' },
      R_relation: n.R_relation || { interactionType: 'chat', intimacyLevel: 0.5, socialDynamics: 'egalitarian', conversationFlow: 'smooth' },
      M_depth: n.M_depth || { importance: 0.5, retentionPriority: 0.5, emotionalWeight: 0.5 },
      G_goods: n.G_goods || [],
      S_senses: n.S_senses || { visual: '', auditory: '', olfactory: '', tactile: '', taste: '' },
    },
    tags: cm.tags || [],
  };
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [chatMemories, setChatMemories] = useState<ChatMemory[]>([]);
  const [messages, setMessages] = useState<Message[]>([{
    id: 'intro',
    role: 'assistant',
    text: '你好，我是海马体情感记忆系统。\n和我聊天吧，我会记住重要的事，并在之后回答时回忆起来。',
  }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchEngine.initialize().then(() => setLoaded(true)).catch(() => setLoaded(true));
    const timer = setTimeout(() => setLoaded(true), 3000);

    // Load server-side memories from memories.json on startup
    fetch('/api/memories')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setChatMemories(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newOnes = data.filter((m: any) => !existingIds.has(m.id));
            return [...newOnes, ...prev].slice(0, 300);
          });
        }
      })
      .catch(() => {});

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const doChat = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;
    setInput('');

    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      const apiMessages = messages
        .filter(m => m.id !== 'intro')
        .map(m => ({ role: m.role, content: m.text }));
      apiMessages.push({ role: 'user', content: text });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      const sysMsg: Message = {
        id: `sys-${Date.now()}`,
        role: 'assistant',
        text: data.reply,
      };
      setMessages(prev => [...prev, sysMsg]);

      if (data.memory) {
        const enriched = { ...data.memory, userInput: text };
        setChatMemories(prev => [enriched, ...prev].slice(0, 300));
        setSelectedId(data.memory.id);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        text: `抱歉，出错了: ${e.message}`,
      }]);
    } finally {
      setSending(false);
    }
  }, [sending, messages]);

  const handleSend = useCallback(() => doChat(input), [input, doChat]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    const reader = new FileReader();
    reader.onload = async () => {
      const content = reader.result as string;
      const truncated = content.slice(0, 3000);
      const fileName = file.name;

      // Show user uploaded message
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: `[上传文件: ${fileName}]\n${truncated.slice(0, 200)}${truncated.length > 200 ? '…' : ''}`,
      };
      setMessages(prev => [...prev, userMsg]);
      setSending(true);

      try {
        // Step 1: Send to knowledge base for article analysis (summary → 9D tokens)
        const kbRes = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: fileName.replace(/\.(txt|md)$/, ''),
            content: truncated,
            category: '文章',
            article: true,
          }),
        });

        let memoryData: any = null;
        if (kbRes.ok) {
          const kbData = await kbRes.json();
          memoryData = kbData.memory;
          if (memoryData) {
            const enriched = { ...memoryData, userInput: `[上传文章] ${fileName}` };
            setChatMemories(prev => [enriched, ...prev].slice(0, 300));
          }
        }

        // Step 2: Chat with 都灵 about the article
        const chatRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'user', content: `我上传了一篇文章《${fileName}》，帮我看看并说说你的感受。\n\n${truncated.slice(0, 1000)}` },
            ],
          }),
        });

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          setMessages(prev => [...prev, {
            id: `sys-reply-${Date.now()}`,
            role: 'assistant',
            text: chatData.reply,
          }]);
        }
      } catch (e: any) {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `抱歉，上传处理出错了: ${e.message}`,
        }]);
      } finally {
        setSending(false);
      }
    };
    reader.readAsText(file);
  }, []);

  if (!loaded) return <LoadingScreen />;

  const presetMemories = searchEngine.getAllMemories();
  const chatAsPreset = chatMemories.map(toPresetMemory);
  const allMemories = [...presetMemories, ...chatAsPreset];
  const selectedMemory = allMemories.find(m => m.id === selectedId);

  return (
    <div className="app">
      <header className="header">
        <h1>海马体 · 情感记忆</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {presetMemories.length + chatMemories.length} 条记忆
        </span>
      </header>

      <div className="main-body">
        {/* Left: visualization panels */}
        <div className="viz-area">
          <div className="viz-grid">
            <KeywordGraph memories={allMemories} selectedId={selectedId} onSelect={setSelectedId} />
            <NineDRadar memory={selectedMemory} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SceneReconstruction memories={allMemories} onSelect={setSelectedId} />
            <MemoryLog memories={chatMemories} onSelect={setSelectedId} />
          </div>
          <Timeline memories={allMemories} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        {/* Right: chat sidebar */}
        <div className="chat-sidebar">
          <div className="chat-messages">
            {messages.map(m => (
              <ChatMessage key={m.id} message={m} />
            ))}
            {sending && (
              <div className="chat-message assistant">
                <div className="chat-avatar">🧠</div>
                <div className="chat-bubble">思考中...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-bar">
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".txt,.md" onChange={handleFileUpload} />
            <button className="chat-btn-icon" onClick={() => fileInputRef.current?.click()} title="上传文本文件">📎</button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="随便聊，我会记住重要的事..."
            />
            <button className="btn btn-primary" onClick={handleSend} disabled={sending || !input.trim()} style={{ padding: '6px 12px', fontSize: 13 }}>
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
