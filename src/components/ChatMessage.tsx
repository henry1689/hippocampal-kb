interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface Props {
  message: Message;
}

export function ChatMessage({ message }: Props) {
  const { role, text } = message;

  return (
    <div className={`chat-message ${role}`}>
      <div className="chat-avatar">{role === 'user' ? '你' : '🧠'}</div>
      <div className="chat-bubble">
        <p style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</p>
      </div>
    </div>
  );
}
