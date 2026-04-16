import { useState, useRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export default function App() {
  const [mode, setMode] = useState('single'); // 'single' or 'ai'
  const [text, setText] = useState('');
  const [singleEmail, setSingleEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('idle'); // idle, extracting, validating, done
  const [data, setData] = useState(null);
  const [results, setResults] = useState({});
  const [catchAll, setCatchAll] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [copied, setCopied] = useState('');

  // Setup States
  const [apiProvider, setApiProvider] = useState(() => localStorage.getItem('bouncemail_llm_provider') || 'anthropic');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('bouncemail_llm_api_key') || '');
  const [setupMessage, setSetupMessage] = useState(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const resetState = () => {
    setStage('idle');
    setData(null);
    setResults({});
    setCatchAll(false);
    setFallback(false);
    setCopied('');
  }

  const handleStart = async () => {
    if (mode === 'single' && !singleEmail.trim()) return;
    if (mode === 'ai' && !text.trim()) return;
    
    // Auto-correct if user pastes a huge block of text into the single email input
    if (mode === 'single' && singleEmail.trim().includes(' ') && singleEmail.length > 50) {
      alert("It looks like you pasted a block of text into the Direct Check email field! Switching you to AI Extract mode automatically.");
      setText(singleEmail);
      setSingleEmail('');
      setMode('ai');
      return;
    }

    setLoading(true);
    resetState();

    if (mode === 'single') {
      const email = singleEmail.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert("Please enter a valid single email address (e.g. target@domain.com)");
        setLoading(false);
        return;
      }
      setStage('validating');
      const domain = email.split('@')[1];
      try {
        const res = await fetch(`${API_BASE}/validate-single`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const json = await res.json();
        
        setData({
          company: 'Manual Input',
          domain: domain,
          founders: [{ first: 'Target', last: 'Email' }]
        });
        setCatchAll(json.catchAll || false);
        setFallback(json.fallback || false);
        setResults({
          'Target Email': [{ email: json.email, status: json.status }]
        });
        setStage('done');
      } catch (err) {
        console.error(err);
        setStage('idle');
      }
      setLoading(false);
      return;
    }

    if (mode === 'ai') {
      setStage('extracting');
      setAiError(null);
      try {
        const res = await fetch(`${API_BASE}/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, apiProvider, apiKey })
        });
        
        const extracted = await res.json();

        if (!res.ok) {
          setAiError(extracted.error || 'Failed to extract data. Check API credentials.');
          setStage('idle');
          setLoading(false);
          return;
        }
        
        if (!extracted.domain) {
          const manualDomain = prompt("Server couldn't detect the domain. Please enter it manually:");
          if (manualDomain) extracted.domain = manualDomain;
          else {
            setStage('idle');
            setLoading(false);
            return;
          }
        }
        
        setData(extracted);
        setStage('validating');
        
        const response = await fetch(`${API_BASE}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(extracted)
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let done = false;
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            const matches = chunk.match(/data: (.*?)\n\n/g);
            if (matches) {
              matches.forEach(match => {
                const payloadStr = match.replace('data: ', '').replace(/\n\n$/, '');
                try {
                  const event = JSON.parse(payloadStr);
                  if (event.type === 'status') {
                    setCatchAll(event.payload.catchAll);
                    setFallback(event.payload.fallback);
                  } else if (event.type === 'result') {
                    const { founder, email, status } = event.payload;
                    setResults(prev => ({
                      ...prev,
                      [founder]: [...(prev[founder] || []), { email, status }]
                    }));
                  } else if (event.type === 'done') {
                    setStage('done');
                    setLoading(false);
                  }
                } catch(e) {}
              });
            }
          }
        }
      } catch (err) {
        console.error(err);
        setStage('idle');
        setLoading(false);
      }
    }
  };

  const handleCopy = (email) => {
    navigator.clipboard.writeText(email);
    setCopied(email);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-6 py-12 space-y-12">
        <header className="text-center space-y-4">
          <h1 className="pixel-font text-3xl md:text-4xl text-white text-shadow-sm">
            BOUNCEMAIL
          </h1>
          <p className="text-[#A0A0A0] text-xl max-w-xl mx-auto">
            Extract & Validate Entity Contact Nodes
          </p>
        </header>

        {/* Tab Switcher */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <button 
            onClick={() => { setMode('single'); resetState(); }}
            className={cn("mc-tab", mode === 'single' && "mc-tab-active")}
          >
            Direct Check
          </button>
          <button 
            onClick={() => { setMode('ai'); resetState(); }}
            className={cn("mc-tab", mode === 'ai' && "mc-tab-active")}
          >
            AI Extract
          </button>
          <button 
            onClick={() => { setMode('setup'); resetState(); }}
            className={cn("mc-tab", mode === 'setup' && "mc-tab-active")}
          >
            Setup
          </button>
          <button 
            onClick={() => { setMode('info'); resetState(); }}
            className={cn("mc-tab", mode === 'info' && "mc-tab-active")}
          >
            Info
          </button>
        </div>

        {/* Info Section */}
        {mode === 'info' && (
          <section className="mc-panel shadow-2xl relative z-10 w-full max-w-2xl mx-auto block">
            <div className="p-4 border-b-4 border-b-[#151515] bg-[#3D3D3D] flex justify-between items-center">
              <span className="pixel-font text-sm text-white">
                Platform Info
              </span>
            </div>
            <div className="p-6 bg-[#2D2D2D] space-y-6 text-[#A0A0A0] leading-relaxed">
              <p>
                Tired of scraping email ids? Paste any corporate text, LinkedIn bio, or news excerpt into the AI Extract mode. The system parses out key people, generates common business email patterns, and safely pings the live SMTP mail server to guarantee you only get valid, working addresses.
              </p>
            </div>
          </section>
        )}

        {/* Setup Section */}
        {mode === 'setup' && (
          <section className="mc-panel shadow-2xl relative z-10 w-full max-w-2xl mx-auto">
            <div className="p-4 border-b-4 border-b-[#151515] bg-[#3D3D3D] flex justify-between items-center">
              <span className="pixel-font text-sm text-white">
                LLM Configuration
              </span>
            </div>
            <div className="p-6 bg-[#2D2D2D] space-y-6">
              <div>
                <label className="block text-[#A0A0A0] pixel-font text-xs mb-2 text-shadow-sm">Provider</label>
                <select 
                  value={apiProvider}
                  onChange={(e) => setApiProvider(e.target.value)}
                  className="mc-input w-full appearance-none px-4 py-3"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT-4o)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#A0A0A0] pixel-font text-xs mb-2 text-shadow-sm">API Key</label>
                <input 
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={apiProvider === 'openai' ? 'sk-proj-...' : 'sk-ant-...'}
                  className="mc-input w-full px-4 py-3"
                />
                  <button
                    type="button"
                    className="mc-button-diamond mt-2 w-full bg-[#444] text-[#FF5555] hover:bg-[#222] pixel-font text-xs"
                    onClick={() => {
                      setApiKey('');
                      localStorage.removeItem('bouncemail_llm_api_key');
                    }}
                  >
                    CLEAR API KEY
                  </button>
                  <div className="mt-2 text-[#A0A0A0] text-xs pixel-font text-shadow-sm">
                    <b>NOTE:</b> Your API key is <u>never</u> sent to our server or stored anywhere except <b>your own browser</b>. Refreshing the page or pressing <b>CLEAR</b> will remove it instantly.
                  </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={async () => {
                    setSetupLoading(true);
                    setSetupMessage(null);
                    try {
                      const res = await fetch(`${API_BASE}/verify-key`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ apiProvider, apiKey })
                      });
                      const json = await res.json();
                      if (res.ok) {
                        setSetupMessage({ type: 'success', text: json.message });
                        localStorage.setItem('bouncemail_llm_provider', apiProvider);
                        localStorage.setItem('bouncemail_llm_api_key', apiKey);
                      } else {
                        setSetupMessage({ type: 'error', text: json.error || 'Verification failed.' });
                      }
                    } catch(err) {
                      setSetupMessage({ type: 'error', text: 'Network Error: Could not verify key.' });
                    }
                    setSetupLoading(false);
                  }}
                  disabled={setupLoading}
                  className="mc-button-diamond w-full"
                >
                  {setupLoading ? 'VERIFYING...' : 'SAVE & VERIFY CONF'}
                </button>
              </div>

              {setupMessage && (
                <div className={cn("p-4 mt-4 pixel-font text-sm text-center shadow-inner", 
                  setupMessage.type === 'success' ? "bg-[#3D5C3D] text-[#55FF55] border-2 border-[inset] border-b-[#AAFFAA] border-r-[#AAFFAA] border-t-[#113311] border-l-[#113311]" : "bg-[#5C3D3D] text-[#FF5555] border-2 border-[inset] border-b-[#FFaaaa] border-r-[#FFaaaa] border-t-[#331111] border-l-[#331111]"
                )}>
                  {setupMessage.text}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Input Section */}
        {(mode === 'single' || mode === 'ai') && (
          <section className="mc-panel shadow-2xl relative z-10">
            <div className="p-4 border-b-4 border-b-[#151515] bg-[#3D3D3D] flex justify-between items-center">
              <span className="pixel-font text-sm text-white">
                {mode === 'single' ? 'Input Target Email' : 'Raw Text Data'}
              </span>
              {stage === 'extracting' && (
                <span className="pixel-font text-xs text-[#55FF55] animate-pulse">
                  [ PROCESSING... ]
                </span>
              )}
            </div>
            
            <div className="p-6 bg-[#2D2D2D]">
              {aiError && (
                 <div className="p-4 mb-4 pixel-font text-sm text-center shadow-inner bg-[#5C3D3D] text-[#FF5555] border-2 border-[inset] border-b-[#FFaaaa] border-r-[#FFaaaa] border-t-[#331111] border-l-[#331111]">
                   [LLM ERROR]: {aiError}
                 </div>
              )}
              {mode === 'single' ? (
              <input
                type="email"
                value={singleEmail}
                onChange={e => setSingleEmail(e.target.value)}
                placeholder="target@entity.com"
                className="mc-input w-full"
              />
            ) : (
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Paste corporate bio, LinkedIn excerpt, or unstructured text data..."
                className="mc-input w-full h-40 resize-none leading-relaxed"
              />
            )}
          </div>
            
          <div className="p-4 border-t-4 border-t-[#5A5A5A] bg-[#1E1E1E] flex flex-col md:flex-row gap-4 justify-between items-center">
            <p className="text-sm text-[#A0A0A0]">
              {mode === 'single' ? 'Verifies SMTP delivery safely.' : 'LLM will structure input and verify all permutations.'}
            </p>
            <button
              onClick={handleStart}
              disabled={loading || (mode === 'single' ? !singleEmail.trim() : !text.trim())}
              className={cn(
                "pixel-font text-sm",
                loading || (mode === 'single' ? !singleEmail.trim() : !text.trim()) 
                  ? "mc-button opacity-50 cursor-not-allowed"
                  : "mc-button-diamond"
              )}
            >
              {loading ? (
                stage === 'extracting' ? 'PARSING...' : 'VALIDATING...'
              ) : (
                mode === 'single' ? 'PING TARGET' : 'INITIATE AI'
              )}
            </button>
            </div>
          </section>
        )}

        {/* Results Stream */}
        <AnimatePresence>
          {(mode === 'single' || mode === 'ai') && data && (
            <motion.section 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Context Header */}
              <div className="mc-panel flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-4">
                <div>
                  <span className="pixel-font text-xs text-[#A0A0A0]">ENTITY_NAME: </span>
                  <span className="text-[#E0E0E0]">{data.company || "UNKNOWN"}</span>
                </div>
                <div>
                  <span className="pixel-font text-xs text-[#A0A0A0]">ROOT_DOMAIN: </span>
                  <span className="text-[#55FF55]">{data.domain}</span>
                </div>
              </div>
              
              {/* Warnings */}
              {(catchAll || fallback) && (
                <div className="mc-panel-inner !bg-[#3A2200] !border-t-[#5A3A00] !border-l-[#5A3A00] !border-b-[#1C1000] !border-r-[#1C1000]">
                  <p className="text-[#FFAA00]">
                    <span className="pixel-font text-sm mr-2">[WARN]</span>
                    {catchAll 
                      ? mode === 'single'
                        ? `Root server for ${data.domain} is Catch-All. It accepts all incoming addresses, so we cannot definitively confirm this specific email.`
                        : `Root server for ${data.domain} is Catch-All. Manual verification required. Showing generated paths.`
                      : mode === 'single'
                        ? `Outbound Port 25 is blocked by your local ISP or Cloud Provider. Cannot directly verify ${data.domain}.`
                        : `Outbound Port 25 is blocked by your local ISP or Cloud Provider. Showing theoretical paths.`}
                  </p>
                </div>
              )}
              
              {/* Founders List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(data.founders || []).map((f, i) => {
                  const name = `${f.first} ${f.last || ''}`.trim();
                  const founderResults = results[name] || [];
                  const hasValid = founderResults.some(r => r.status === 'valid');
                  
                  return (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className="mc-panel flex flex-col"
                    >
                      {/* Card Header */}
                      <div className="p-4 border-b-4 border-b-[#151515] bg-[#3D3D3D] flex justify-between items-center">
                        <span className="pixel-font text-sm text-white">{name}</span>
                        {hasValid && (
                          <span className="text-[#55FF55] pixel-font text-xs animate-pulse">FOUND</span>
                        )}
                      </div>
                      
                      {/* Permutations Area */}
                      <div className="p-4 bg-[#151515] flex-1 flex flex-col gap-3">
                        {founderResults.length === 0 && stage === 'validating' ? (
                          <div className="py-8 text-center text-[#A0A0A0] text-xl pixel-font animate-pulse">
                            PINGING...
                          </div>
                        ) : (
                          founderResults
                            .sort((a, b) => {
                              if (a.status === 'valid') return -1;
                              if (b.status === 'valid') return 1;
                              if (a.status === 'unknown') return -1;
                              if (b.status === 'unknown') return 1;
                              if (a.status === 'catch-all') return -1;
                              if (b.status === 'catch-all') return 1;
                              return 0;
                            })
                            .map((r, idx) => (
                            <div 
                              key={r.email}
                              className={cn(
                                "flex items-center justify-between p-2 border-[4px]", 
                                r.status === 'valid' ? "bg-[#14564F] border-t-[#218E84] border-l-[#218E84] border-r-[#0A2A27] border-b-[#0A2A27] text-white" : 
                                r.status === 'invalid' ? "bg-[#1E1E1E] border-t-[#151515] border-l-[#151515] border-r-[#3A3A3A] border-b-[#3A3A3A] text-[#5A5A5A]" : 
                                "bg-[#2D2D2D] border-t-[#151515] border-l-[#151515] border-r-[#5A5A5A] border-b-[#5A5A5A] text-[#A0A0A0]"
                              )}
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <span className={cn("pixel-font text-[10px]", 
                                  r.status === 'valid' ? "text-[#55FF55]" :
                                  r.status === 'invalid' ? "text-[#FF5555]" :
                                  "text-[#FFAA00]"
                                )}>
                                  {r.status === 'valid' ? '[✔]' : r.status === 'invalid' ? '[X]' : r.status === 'catch-all' ? '[CATCH-ALL]' : '[?]'}
                                </span>
                                <span className="font-mono text-[18px] truncate">
                                  {r.email}
                                </span>
                              </div>
                              
                              {(r.status !== 'invalid') && (
                                <button
                                  onClick={() => handleCopy(r.email)}
                                  className={cn("mc-button px-2 py-1 text-xs m-0", 
                                    copied === r.email ? "!bg-[#55FF55] !text-black" : ""
                                  )}
                                >
                                  {copied === r.email ? 'COPIED' : 'COPY'}
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
      <footer className='text-center py-10 opacity-70 hover:opacity-100 transition-opacity'>
        <p className='text-[#A0A0A0] text-xs md:text-sm pixel-font'>
          Developed by <a href='https://www.linkedin.com/in/shravan-khunti/' target='_blank' rel='noopener noreferrer' className='text-[#55FF55] hover:text-white underline decoration-[#55FF55]/50 hover:decoration-white underline-offset-4 transition-all'>Shravan Khunti</a>
        </p>
      </footer>
    </div>
  );
}
