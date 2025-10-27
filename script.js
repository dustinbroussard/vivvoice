
    // Canvas and visual setup
    const canvas = document.getElementById('orbCanvas');
    const ctx = canvas.getContext('2d');
    const statusOverlay = document.getElementById('statusOverlay');
    
    function resizeCanvas() {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Visual state
    let volume = 0;
    let targetVolume = 0;
    let currentMoodColor = '#00FF88';
    let targetMoodColor = '#00FF88';
    let pulseOffset = 0;
    let particles = [];
    let isListening = true; // Start in listening state
    let isProcessing = false;
    let isSpeaking = false;

    // Audio setup (reserved for future local capture)
    // let mediaRecorder;
    // let audioChunks = [];
    let recognition;
    let synthesis = window.speechSynthesis;

    // API configuration
    let apiKey = localStorage.getItem('openrouter_api_key') || '';
    let selectedModel = localStorage.getItem('selected_model') || 'deepseek/deepseek-chat:free';
    let systemPrompt = localStorage.getItem('system_prompt') || 'You are VIVICA, a helpful and friendly AI assistant. Respond conversationally and keep responses concise for voice interaction.';

    // UI Elements
    const settingsPanel = document.getElementById('settingsPanel');
    const closeSettings = document.getElementById('closeSettings');
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');
    const systemPromptInput = document.getElementById('systemPrompt');

    // Long press detection
    let longPressTimer;
    let isLongPress = false;

    // Status overlay helper
    function setStatus(text) {
      if (!statusOverlay) return;
      statusOverlay.textContent = text || '';
      statusOverlay.style.opacity = text ? '0.85' : '0';
    }

    // Color helpers to avoid nonstandard 8-digit hex
    function hexToRgb(hex) {
      const h = hex.replace('#', '').trim();
      if (h.length !== 6) return { r: 0, g: 255, b: 136 };
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16)
      };
    }
    function rgbaStr({ r, g, b }, a) {
      const alpha = Math.max(0, Math.min(1, a));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Particle system
    class Particle {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.life = 1.0;
        this.size = Math.random() * 3 + 1;
      }
      
      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.01;
        this.vx *= 0.99;
        this.vy *= 0.99;
      }
      
      draw() {
        const alpha = this.life;
        ctx.save();
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = currentMoodColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function lerpColor(color1, color2, factor) {
      const hex1 = color1.replace('#', '');
      const hex2 = color2.replace('#', '');
      
      const r1 = parseInt(hex1.substr(0, 2), 16);
      const g1 = parseInt(hex1.substr(2, 2), 16);
      const b1 = parseInt(hex1.substr(4, 2), 16);
      
      const r2 = parseInt(hex2.substr(0, 2), 16);
      const g2 = parseInt(hex2.substr(2, 2), 16);
      const b2 = parseInt(hex2.substr(4, 2), 16);
      
      const r = Math.round(r1 + (r2 - r1) * factor);
      const g = Math.round(g1 + (g2 - g1) * factor);
      const b = Math.round(b1 + (b2 - b1) * factor);
      
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    function drawOrb() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const baseRadius = Math.min(canvas.width, canvas.height) * 0.15;
      const volumeRadius = volume * (baseRadius * 2);
      const pulseRadius = Math.sin(pulseOffset) * (baseRadius * 0.2);
      const radius = baseRadius + volumeRadius + pulseRadius;

      const x = canvas.width / 2;
      const y = canvas.height / 2;

      // Colors
      const rgb = hexToRgb(currentMoodColor);
      // Outer glow
      const outerGlow = ctx.createRadialGradient(x, y, radius * 0.3, x, y, radius * 2.5);
      outerGlow.addColorStop(0, rgbaStr(rgb, 0.25));
      outerGlow.addColorStop(0.5, rgbaStr(rgb, 0.125));
      outerGlow.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.beginPath();
      ctx.fillStyle = outerGlow;
      ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Main orb
      const gradient = ctx.createRadialGradient(x, y, 10, x, y, radius);
      gradient.addColorStop(0, rgbaStr(rgb, 0.8));
      gradient.addColorStop(0.4, rgbaStr(rgb, 0.53));
      gradient.addColorStop(0.8, rgbaStr(rgb, 0.27));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.beginPath();
      ctx.fillStyle = gradient;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner core
      const coreGradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.3);
      coreGradient.addColorStop(0, '#FFFFFF');
      coreGradient.addColorStop(1, rgbaStr(rgb, 0.53));
      
      ctx.beginPath();
      ctx.fillStyle = coreGradient;
      ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Particles for active states
      if (volume > 0.1 || isProcessing) {
        for (let i = 0; i < (isProcessing ? 5 : 2); i++) {
          const angle = Math.random() * Math.PI * 2;
          const distance = radius * (0.5 + Math.random() * 0.5);
          const px = x + Math.cos(angle) * distance;
          const py = y + Math.sin(angle) * distance;
          particles.push(new Particle(px, py));
        }
      }

      // Update particles and avoid unbounded growth
      particles = particles.filter(p => p.life > 0);
      if (particles.length > 800) particles.length = 800;
      particles.forEach(p => {
        p.update();
        p.draw();
      });
    }

    function updateMood(color) {
      targetMoodColor = color;
      const rgb = hexToRgb(color);
      document.body.style.background = `radial-gradient(circle, ${rgbaStr(rgb, 0.13)} 0%, black 80%)`;
    }

    function setState(state) {
      switch(state) {
        case 'listening':
          updateMood('#00FF88');
          isListening = true;
          isProcessing = false;
          isSpeaking = false;
          break;
        case 'processing':
          updateMood('#FFD700');
          targetVolume = 0.3;
          isListening = false;
          isProcessing = true;
          isSpeaking = false;
          break;
        case 'speaking':
          updateMood('#FF6B6B');
          targetVolume = 0.5;
          isListening = false;
          isProcessing = false;
          isSpeaking = true;
          break;
        case 'error':
          updateMood('#FF4444');
          targetVolume = 0;
          isListening = false;
          isProcessing = false;
          isSpeaking = false;
          setTimeout(() => setState('listening'), 3000); // Return to listening state
          break;
      }
    }

    // Speech Recognition Setup
    function initSpeechRecognition() {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        recognition = new SpeechRec();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setState('listening');
          setStatus('Listening…');
        };

        recognition.onresult = (event) => {
          const transcript = event.results?.[0]?.[0]?.transcript;
          if (transcript) {
            setStatus(`You: ${transcript}`);
            processQuery(transcript);
          } else {
            setStatus('Heard nothing. Please try again.');
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setStatus(`Speech recognition error: ${event.error}`);
          setState('error');
        };

        recognition.onend = () => {
          // Auto-restart recognition to maintain listening state
          if (!isProcessing && !isSpeaking) {
            setTimeout(() => {
              if (recognition && !settingsPanel.classList.contains('open')) {
                try {
                  if (!isProcessing && !isSpeaking) {
                    recognition.start();
                  }
                } catch (e) {
                  console.log('Recognition restart failed:', e);
                }
              }
            }, 1000);
          }
        };
      } else {
        console.warn('SpeechRecognition API not supported in this browser');
        setStatus('Speech recognition not supported in this browser.');
      }
    }

    // API Call to OpenRouter
    async function processQuery(query) {
      if (!apiKey) {
        setStatus('Missing API key. Opening settings…');
        speak("Please configure your OpenRouter API key in settings.");
        if (!settingsPanel.classList.contains('open')) {
          toggleSettings();
        }
        return;
      }

      setState('processing');
      setStatus('Thinking…');

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'VIVICA Voice Assistant'
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: query }
            ],
            max_tokens: 300,
            temperature: 0.7
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
          let msg = `API Error: ${response.status}`;
          if (response.status === 401) msg = 'Unauthorized: Check your API key.';
          if (response.status === 429) msg = 'Rate limited: Please slow down.';
          throw new Error(msg);
        }

        const data = await response.json();
        const aiResponse = data?.choices?.[0]?.message?.content || 'Sorry, I could not understand the response.';
        
        speak(aiResponse);
        setStatus(`VIVICA: ${aiResponse}`);

      } catch (error) {
        console.error('API Error:', error);
        const errText = `${error?.message || error}`;
        setStatus(errText);
        const friendly = errText.includes('Unauthorized')
          ? 'Your API key looks invalid. Please check settings.'
          : errText.includes('rate') || errText.includes('429')
          ? 'I am being rate limited. Let’s wait a moment.'
          : errText.includes('AbortError')
          ? 'The request timed out. Please try again.'
          : 'Sorry, I encountered an error processing your request.';
        speak(friendly);
        setState('error');
      }
    }

    // Text-to-Speech
    function speak(text) {
      setState('speaking');
      
      // Cancel any ongoing speech
      synthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      utterance.volume = 0.8;

      utterance.onstart = () => {
        targetVolume = 0.6;
      };

      utterance.onend = () => {
        // Return to listening state after speaking
        setState('listening');
        if (recognition) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {
              console.log('Recognition restart after speaking failed:', e);
            }
          }, 500);
        }
      };

      utterance.onerror = () => {
        setState('error');
      };

      synthesis.speak(utterance);
    }

    function toggleSettings() {
      if (settingsPanel.classList.contains('open')) {
        settingsPanel.classList.remove('open');
        // Save settings
        apiKey = apiKeyInput.value;
        selectedModel = modelSelect.value;
        systemPrompt = systemPromptInput.value;
        
        localStorage.setItem('openrouter_api_key', apiKey);
        localStorage.setItem('selected_model', selectedModel);
        localStorage.setItem('system_prompt', systemPrompt);
        
        // Restart recognition if it was stopped
        if (recognition && !isSpeaking && !isProcessing) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {
              console.log('Recognition restart after settings failed:', e);
            }
          }, 500);
        }
      } else {
        settingsPanel.classList.add('open');
        // Stop recognition while settings are open
        if (recognition) {
          recognition.stop();
        }
        // Load current settings
        apiKeyInput.value = apiKey;
        modelSelect.value = selectedModel;
        systemPromptInput.value = systemPrompt;
      }
    }

    // Event Listeners

    closeSettings.addEventListener('click', () => {
      toggleSettings();
    });

    // Spacebar for settings
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        toggleSettings();
      }
    });

    // Long press for mobile settings
    function startLongPress(e) {
      e.preventDefault();
      isLongPress = false;
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        toggleSettings();
        // Haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }, 800);
    }

    function endLongPress(e) {
      clearTimeout(longPressTimer);
      if (!isLongPress && !settingsPanel.classList.contains('open')) {
        // Short tap - interrupt speech if speaking
        if (synthesis.speaking) {
          synthesis.cancel();
          setState('listening');
          if (recognition) {
            setTimeout(() => {
              try {
                recognition.start();
              } catch (e) {
                console.log('Recognition restart failed:', e);
              }
            }, 500);
          }
        }
      }
    }

    canvas.addEventListener('touchstart', startLongPress);
    canvas.addEventListener('touchend', endLongPress);
    canvas.addEventListener('touchcancel', endLongPress);
    canvas.addEventListener('mousedown', startLongPress);
    canvas.addEventListener('mouseup', endLongPress);
    canvas.addEventListener('mouseleave', endLongPress);

    // Animation loop
    function animate() {
      volume += (targetVolume - volume) * 0.15;
      
      if (currentMoodColor !== targetMoodColor) {
        currentMoodColor = lerpColor(currentMoodColor, targetMoodColor, 0.05);
      }
      
      // Audio-reactive volume simulation
      if (isListening) {
        targetVolume = 0.2 + Math.random() * 0.3;
      } else if (isSpeaking) {
        targetVolume = 0.4 + Math.sin(Date.now() * 0.01) * 0.2;
      } else if (isProcessing) {
        targetVolume = 0.3 + Math.sin(Date.now() * 0.005) * 0.1;
      }
      
      pulseOffset += isProcessing ? 0.2 : 0.05;
      
      drawOrb();
      requestAnimationFrame(animate);
    }

    // Initialize
    initSpeechRecognition();
    setState('listening');
    
    // Start recognition automatically after a short delay
    setTimeout(() => {
      if (recognition) {
        try {
          recognition.start();
        } catch (e) {
          console.log('Initial recognition start failed:', e);
        }
      }
    }, 1000);
    
    animate();

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('data:text/javascript;base64,c2VsZi5hZGRFdmVudExpc3RlbmVyKCJpbnN0YWxsIiwgZnVuY3Rpb24oZXZlbnQpIHsgZXZlbnQud2FpdFVudGlsKHNlbGYuc2tpcEFhaXRpbmcoKSk7IH0pOw==')
        .catch(err => console.warn('SW registration failed:', err));
    }

    // Prevent zoom on double tap
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function (event) {
      const now = (new Date()).getTime();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    }, false);
  
