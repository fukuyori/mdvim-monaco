import * as monaco from 'monaco-editor';
import { initVimMode, VimMode } from 'monaco-vim';
import { marked } from 'marked';
import JSZip from 'jszip';
import mermaid from 'mermaid';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import Encoding from 'encoding-japanese';

// Configure marked for synchronous parsing with GFM (GitHub Flavored Markdown)
marked.setOptions({
  async: false,
  gfm: true,       // Enable GitHub Flavored Markdown
  breaks: true,    // Convert \n to <br>
});

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
});

// Define custom Monaco themes with heading colors
function defineCustomThemes() {
  // Heading colors (案C: 落ち着いたトーン)
  const headingColors = {
    h1: '#FF7043', // コーラル
    h2: '#FFB300', // アンバー
    h3: '#26A69A', // ティール
    h4: '#5C6BC0', // スチールブルー
    h5: '#78909C', // スレートグレー
    h6: '#8D6E63', // ブラウングレー
  };

  // Custom dark theme
  monaco.editor.defineTheme('mdvim-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword.md', foreground: headingColors.h1.slice(1) },  // # heading
      { token: 'string.md', foreground: '9CDCFE' },
      { token: 'variable.md', foreground: 'CE9178' },
    ],
    colors: {}
  });

  // Custom light theme
  monaco.editor.defineTheme('mdvim-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword.md', foreground: headingColors.h1.slice(1) },
    ],
    colors: {}
  });
}

// Call to define themes
defineCustomThemes();

// ========== Types ==========

type Theme = 'dark' | 'light' | 'monokai' | 'solarized-dark' | 'solarized-light' | 'nord' | 'dracula' | 'github-dark' | 'github-light';
type ViewMode = 'editor' | 'split' | 'preview';

// Map themes to Monaco editor themes
const monacoThemeMap: Record<Theme, string> = {
  'dark': 'vs-dark',
  'light': 'vs',
  'monokai': 'vs-dark',
  'solarized-dark': 'vs-dark',
  'solarized-light': 'vs',
  'nord': 'vs-dark',
  'dracula': 'vs-dark',
  'github-dark': 'vs-dark',
  'github-light': 'vs',
};

interface Settings {
  theme: Theme;
  fontSize: number;
  vimEnabled: boolean;
  wrap: boolean;
  tabSize: number;
  viewMode: ViewMode;
  autoSave: boolean;
  autoSaveInterval: number; // seconds
}

interface EmbeddedImage {
  id: string;
  filename: string;
  mimeType: string;
  data: string; // Base64
}

// ========== Tauri API ==========

// Tauri v2 plugin APIs
let tauriDialog: typeof import('@tauri-apps/plugin-dialog') | null = null;
let tauriFs: typeof import('@tauri-apps/plugin-fs') | null = null;
let tauriEvent: typeof import('@tauri-apps/api/event') | null = null;
let tauriPath: typeof import('@tauri-apps/api/path') | null = null;
let tauriHttp: typeof import('@tauri-apps/plugin-http') | null = null;
let tauriCli: typeof import('@tauri-apps/plugin-cli') | null = null;

async function loadTauriApis() {
  try {
    tauriDialog = await import('@tauri-apps/plugin-dialog');
    tauriFs = await import('@tauri-apps/plugin-fs');
    tauriEvent = await import('@tauri-apps/api/event');
    tauriPath = await import('@tauri-apps/api/path');
    tauriHttp = await import('@tauri-apps/plugin-http');
    tauriCli = await import('@tauri-apps/plugin-cli');
    console.log('Tauri APIs loaded');
  } catch {
    console.log('Running in browser mode (Tauri APIs not available)');
  }
}

// ========== Monaco Workers ==========

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

self.MonacoEnvironment = {
  getWorker(_: unknown, _label: string) {
    return new editorWorker();
  },
};

// ========== Main App Class ==========

class MdVimApp {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private vimMode: VimMode | null = null;
  
  // Settings
  private settings: Settings = {
    theme: 'dark',
    fontSize: 100,
    vimEnabled: true,
    wrap: true,
    tabSize: 2,
    viewMode: 'split',
    autoSave: true,
    autoSaveInterval: 30,
  };
  
  // State
  private modified = false;
  private fileName = 'Untitled';
  private currentFilePath: string | null = null;
  private currentDirectory: string | null = null;  // カレントディレクトリ
  private isComposing = false; // IME composition state
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private lastSavedContent = ''; // For auto-save comparison
  
  // Image management
  private images: Map<string, EmbeddedImage> = new Map();

  // DOM Elements
  private editorContainer: HTMLElement;
  private preview: HTMLElement;
  private vimStatusbar: HTMLElement;
  private cursorPos: HTMLElement;
  private statsInfo: HTMLElement;
  private fileNameEl: HTMLElement;
  private fileStatus: HTMLElement;
  private fontSizeDisplay: HTMLElement;
  private vimToggleBtn: HTMLElement;
  private themeSelector: HTMLSelectElement;
  private tocPane: HTMLElement;
  private tocContent: HTMLElement;

  constructor() {
    // Load settings first
    this.loadSettings();

    // Get DOM elements
    this.editorContainer = document.getElementById('editor-container')!;
    this.preview = document.getElementById('preview')!;
    this.vimStatusbar = document.getElementById('vim-statusbar')!;
    this.cursorPos = document.getElementById('cursor-pos')!;
    this.statsInfo = document.getElementById('stats-info')!;
    this.fileNameEl = document.getElementById('file-name')!;
    this.fileStatus = document.getElementById('file-status')!;
    this.fontSizeDisplay = document.getElementById('font-size-display')!;
    this.vimToggleBtn = document.getElementById('btn-vim-toggle')!;
    this.themeSelector = document.getElementById('theme-selector') as HTMLSelectElement;
    this.tocPane = document.getElementById('toc-pane')!;
    this.tocContent = document.getElementById('toc-content')!;

    // Initialize Monaco Editor
    this.editor = monaco.editor.create(this.editorContainer, {
      value: this.getDefaultContent(),
      language: 'markdown',
      theme: monacoThemeMap[this.settings.theme],
      fontSize: this.calculateFontSize(),
      fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
      lineNumbers: 'on',
      wordWrap: this.settings.wrap ? 'on' : 'off',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      cursorStyle: 'block',
      cursorBlinking: 'solid',
      renderWhitespace: 'selection',
      tabSize: this.settings.tabSize,
      insertSpaces: true,
      folding: true,
      lineDecorationsWidth: 10,
      lineNumbersMinChars: 3,
      dropIntoEditor: { enabled: false },
    });

    // Initialize Vim mode
    this.initVimMode();

    // Setup event listeners
    this.setupEventListeners();
    
    // Setup IME composition handling for Vim mode
    this.setupIMEHandler();

    // Apply initial UI state
    this.applySettings();
    this.updatePreview();
    this.updateCursorPosition();
    this.updateStats();
    
    // Initialize TOC (show by default)
    this.updateToc();

    // Load Tauri APIs and setup file drop listener
    loadTauriApis().then(() => {
      this.setupTauriFileDrop();
      // Load settings from config file after Tauri APIs are available
      this.loadSettingsFromFile();
      // Handle command line arguments
      this.handleCliArgs();
    });
    
    // Initialize auto-save
    this.initAutoSave();
    
    // Store initial content for auto-save comparison
    this.lastSavedContent = this.editor.getValue();
    
    console.log('MdVimApp initialized');
  }

  private async setupTauriFileDrop(): Promise<void> {
    if (!tauriEvent || !tauriFs) return;
    
    try {
      await tauriEvent.listen('tauri://file-drop', async (event: any) => {
        console.log('Tauri file drop:', event);
        const paths = event.payload as string[];
        
        for (const filePath of paths) {
          const ext = filePath.toLowerCase().split('.').pop() || '';
          const fileName = filePath.split(/[/\\]/).pop() || 'file';
          console.log('Processing Tauri drop:', fileName, 'ext:', ext);
          
          // Check if it's an image
          const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
          
          if (imageExts.includes(ext)) {
            try {
              const data = await tauriFs!.readFile(filePath);
              const blob = new Blob([new Uint8Array(data)]);
              const id = await this.addImage(blob, fileName);
              this.insertImageMarkdown(id, fileName.replace(/\.[^.]+$/, ''));
              console.log('Image inserted:', id);
            } catch (err) {
              console.error('Failed to read dropped image:', err);
            }
            continue;
          }
          
          // Check if it's a markdown/text file
          if (ext === 'md' || ext === 'markdown' || ext === 'txt' || ext === 'mdvim') {
            console.log('Opening file via Tauri:', filePath);
            
            // Confirm if modified
            if (this.modified) {
              const confirmed = confirm('現在の変更を破棄してファイルを開きますか？');
              if (!confirmed) continue;
            }
            
            try {
              if (ext === 'mdvim') {
                // Load .mdvim file
                await this.loadMdvim(filePath);
              } else {
                // Load plain text/markdown file with encoding detection
                const binaryData = await tauriFs!.readFile(filePath);
                const content = this.decodeWithAutoDetect(new Uint8Array(binaryData));
                this.editor.setValue(content);
                this.images.clear();
                this.currentFilePath = filePath;
                this.fileName = fileName;
                this.fileNameEl.textContent = this.fileName;
                this.modified = false;
                this.fileStatus.textContent = '';
              }
              console.log('File loaded successfully:', fileName);
            } catch (err) {
              console.error('Failed to load file:', err);
              this.fileStatus.textContent = '(load failed)';
            }
            break; // Only open first file
          }
        }
        this.updatePreview();
      });
      console.log('Tauri file drop listener registered');
    } catch (err) {
      console.log('Failed to setup Tauri file drop:', err);
    }
  }

  private async handleCliArgs(): Promise<void> {
    if (!tauriCli) return;
    
    try {
      const matches = await tauriCli.getMatches();
      const fileArg = matches.args['file'];
      
      if (fileArg && fileArg.value && typeof fileArg.value === 'string') {
        const filePath = fileArg.value;
        console.log('Opening file from CLI:', filePath);
        
        // Check if it's a URL
        if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
          await this.fetchMarkdownFromUrl(filePath);
        } else {
          await this.openFileByPath(filePath);
        }
      }
    } catch (err) {
      console.log('No CLI arguments or error:', err);
    }
  }

  private calculateFontSize(): number {
    return 14 * (this.settings.fontSize / 100);
  }

  private getDefaultContent(): string {
    return `# Welcome to mdvim

A Markdown editor with **Vim keybindings** powered by Monaco Editor.

## Features

- Full Vim keybindings support
- Live preview
- Syntax highlighting
- Word wrap with correct line numbers

## Vim Commands

- \`i\` - Insert mode
- \`Esc\` - Normal mode
- \`v\` - Visual mode
- \`:w\` - Save
- \`:q\` - Quit
- \`:e filename\` - Open file

## Keyboard Shortcuts

- \`Ctrl+O\` - Open file
- \`Ctrl+S\` - Save file
- \`Ctrl+Shift+S\` - Save as
- \`Ctrl+N\` - New file

Enjoy editing!
`;
  }

  // ========== Settings Management ==========

  private configFilePath: string | null = null;

  private async getConfigFilePath(): Promise<string | null> {
    if (this.configFilePath) return this.configFilePath;
    
    if (!tauriPath || !tauriFs) return null;
    
    try {
      // Get home directory and construct config path
      const homeDir = await tauriPath.homeDir();
      const configDir = `${homeDir}.config/mdvim`;
      this.configFilePath = `${configDir}/config.json`;
      
      // Ensure config directory exists
      try {
        await tauriFs.mkdir(configDir, { recursive: true });
      } catch {
        // Directory may already exist
      }
      
      return this.configFilePath;
    } catch (err) {
      console.warn('Failed to get config path:', err);
      return null;
    }
  }

  private loadSettings(): void {
    // Load from localStorage first (sync, for initial render)
    const saved = localStorage.getItem('mdvim-monaco-settings');
    if (saved) {
      try {
        const s: Partial<Settings> = JSON.parse(saved);
        this.settings = { ...this.settings, ...s };
      } catch {
        console.warn('Failed to load settings from localStorage');
      }
    }
    
    // Then try to load from config file (async)
    this.loadSettingsFromFile();
  }

  private async loadSettingsFromFile(): Promise<void> {
    if (!tauriFs) return;
    
    const configPath = await this.getConfigFilePath();
    if (!configPath) return;
    
    try {
      const content = await tauriFs.readTextFile(configPath);
      const s: Partial<Settings> = JSON.parse(content);
      this.settings = { ...this.settings, ...s };
      this.applySettings();
      console.log('Settings loaded from:', configPath);
    } catch {
      // Config file doesn't exist yet, will be created on first save
      console.log('No config file found, using defaults');
    }
  }

  private saveSettings(): void {
    // Save to localStorage (sync, for browser fallback)
    localStorage.setItem('mdvim-monaco-settings', JSON.stringify(this.settings));
    
    // Save to config file (async)
    this.saveSettingsToFile();
  }

  private async saveSettingsToFile(): Promise<void> {
    if (!tauriFs) return;
    
    const configPath = await this.getConfigFilePath();
    if (!configPath) return;
    
    try {
      const content = JSON.stringify(this.settings, null, 2);
      await tauriFs.writeTextFile(configPath, content);
      console.log('Settings saved to:', configPath);
    } catch (err) {
      console.warn('Failed to save settings to file:', err);
    }
  }

  private applySettings(): void {
    // Theme
    document.documentElement.dataset.theme = this.settings.theme;
    monaco.editor.setTheme(monacoThemeMap[this.settings.theme]);
    this.themeSelector.value = this.settings.theme;

    // View mode
    document.getElementById('app')!.dataset.viewMode = this.settings.viewMode;
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === this.settings.viewMode);
    });

    // Font size
    this.fontSizeDisplay.textContent = `${this.settings.fontSize}%`;
    this.editor.updateOptions({ fontSize: this.calculateFontSize() });

    // Vim toggle
    this.vimToggleBtn.classList.toggle('active', this.settings.vimEnabled);

    // Wrap
    this.editor.updateOptions({ wordWrap: this.settings.wrap ? 'on' : 'off' });

    // Tab size
    this.editor.updateOptions({ tabSize: this.settings.tabSize });
  }

  // ========== IME Handler (Fix for Japanese input in Normal mode) ==========

  private setupIMEHandler(): void {
    const editorDom = this.editor.getDomNode();
    if (!editorDom) return;

    // Track IME composition state
    editorDom.addEventListener('compositionstart', () => {
      this.isComposing = true;
    });

    editorDom.addEventListener('compositionend', () => {
      this.isComposing = false;
      
      // If in Vim normal mode, undo the composed text
      if (this.settings.vimEnabled && this.vimMode) {
        const statusText = this.vimStatusbar.textContent || '';
        // Check if we're in normal mode (not insert, visual, etc.)
        if (!statusText.includes('INSERT') && 
            !statusText.includes('VISUAL') && 
            !statusText.includes('REPLACE')) {
          // Undo the IME input
          this.editor.trigger('keyboard', 'undo', null);
        }
      }
    });
  }

  // ========== Auto Save ==========

  private initAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    if (this.settings.autoSave) {
      this.autoSaveTimer = setInterval(() => {
        this.performAutoSave();
      }, this.settings.autoSaveInterval * 1000);
    }
  }

  private performAutoSave(): void {
    const currentContent = this.editor.getValue();
    
    // Only save if content has changed
    if (currentContent === this.lastSavedContent) {
      return;
    }

    // Save to localStorage as backup
    const backupKey = 'mdvim-autosave-backup';
    const backup = {
      content: currentContent,
      fileName: this.fileName,
      timestamp: Date.now(),
      images: Array.from(this.images.entries()),
    };
    
    try {
      localStorage.setItem(backupKey, JSON.stringify(backup));
      this.lastSavedContent = currentContent;
      
      // Show brief indicator
      const originalStatus = this.fileStatus.textContent;
      this.fileStatus.textContent = '(auto-saved)';
      setTimeout(() => {
        if (this.fileStatus.textContent === '(auto-saved)') {
          this.fileStatus.textContent = this.modified ? '(modified)' : originalStatus || '';
        }
      }, 1500);
      
      console.log('Auto-saved to localStorage');
    } catch (err) {
      console.error('Auto-save failed:', err);
    }
  }

  private restoreFromAutoSave(): boolean {
    const backupKey = 'mdvim-autosave-backup';
    const saved = localStorage.getItem(backupKey);
    
    if (!saved) return false;
    
    try {
      const backup = JSON.parse(saved);
      
      // Check if backup is recent (within 24 hours)
      const age = Date.now() - backup.timestamp;
      if (age > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(backupKey);
        return false;
      }
      
      // Restore content
      this.editor.setValue(backup.content);
      this.fileName = backup.fileName || 'Untitled';
      this.fileNameEl.textContent = this.fileName;
      
      // Restore images
      if (backup.images && Array.isArray(backup.images)) {
        this.images = new Map(backup.images);
      }
      
      this.modified = true;
      this.fileStatus.textContent = '(restored from auto-save)';
      this.lastSavedContent = backup.content;
      
      return true;
    } catch (err) {
      console.error('Failed to restore from auto-save:', err);
      return false;
    }
  }

  // ========== Vim Mode ==========

  private initVimMode(): void {
    if (this.vimMode) {
      this.vimMode.dispose();
      this.vimMode = null;
    }

    if (this.settings.vimEnabled) {
      this.vimMode = initVimMode(this.editor, this.vimStatusbar);
      
      // Register custom Vim commands
      this.registerVimCommands();
    }
  }

  private registerVimCommands(): void {
    // Access Vim's command-line mode API via VimMode.Vim
    const Vim = VimMode.Vim;
    if (!Vim) {
      console.warn('VimMode.Vim not available for custom commands');
      return;
    }

    // :w - Save file
    Vim.defineEx('write', 'w', (_cm: any, params: any) => {
      if (params.args && params.args.length > 0) {
        // :w filename - save as
        this.saveFileWithName(params.args[0]);
      } else {
        this.saveFile();
      }
    });

    // :q - Quit
    Vim.defineEx('quit', 'q', (_cm: any, params: any) => {
      const force = params.argString?.includes('!');
      this.quit(force);
    });

    // :wq - Save and quit
    Vim.defineEx('wq', 'wq', async () => {
      await this.saveFile();
      this.quit(true);
    });

    // :x - Save if modified and quit
    Vim.defineEx('xit', 'x', async () => {
      if (this.modified) {
        await this.saveFile();
      }
      this.quit(true);
    });

    // :e - Open file or URL
    Vim.defineEx('edit', 'e', (_cm: any, params: any) => {
      if (params.args && params.args.length > 0) {
        const path = params.args[0];
        // Check if it's a URL
        if (path.startsWith('http://') || path.startsWith('https://')) {
          this.fetchMarkdownFromUrl(path);
        } else {
          this.openFileByPath(path);
        }
      } else {
        this.openFile();
      }
    });

    // :new - New file
    Vim.defineEx('new', 'new', () => {
      this.newFile();
    });

    // :set - Set options
    Vim.defineEx('set', 'se', (_cm: any, params: any) => {
      this.handleSetCommand(params.argString || '');
    });

    // :theme - Set theme
    Vim.defineEx('theme', 'theme', (_cm: any, params: any) => {
      const theme = params.args?.[0];
      if (theme === 'dark' || theme === 'light') {
        this.setTheme(theme);
      }
    });

    // :help - Show help
    Vim.defineEx('help', 'h', () => {
      this.toggleHelp();
    });

    // :toc - Toggle Table of Contents
    Vim.defineEx('toc', 'toc', () => {
      this.toggleToc();
    });

    // :export - Export to HTML
    Vim.defineEx('export', 'exp', () => {
      this.exportToHtml();
    });

    // :pdf - Export to PDF
    Vim.defineEx('pdf', 'pdf', () => {
      this.exportToPdf();
    });

    // :image - Insert image
    Vim.defineEx('image', 'ima', () => {
      this.selectAndInsertImage();
    });

    // :fetch / :url - Fetch markdown from URL (with prompt)
    Vim.defineEx('fetch', 'fetch', (_cm: any, params: any) => {
      if (params.args && params.args.length > 0) {
        this.fetchMarkdownFromUrl(params.args[0]);
      } else {
        this.promptAndFetchUrl();
      }
    });
    
    Vim.defineEx('url', 'url', (_cm: any, params: any) => {
      if (params.args && params.args.length > 0) {
        this.fetchMarkdownFromUrl(params.args[0]);
      } else {
        this.promptAndFetchUrl();
      }
    });

    // :pwd - Print working directory
    Vim.defineEx('pwd', 'pwd', () => {
      const dir = this.currentDirectory || '(not set)';
      this.fileStatus.textContent = dir;
      // Keep showing for longer
      setTimeout(() => {
        if (this.fileStatus.textContent === dir) {
          this.fileStatus.textContent = this.modified ? '(modified)' : '';
        }
      }, 5000);
    });

    // :cd - Change directory
    Vim.defineEx('cd', 'cd', async (_cm: any, params: any) => {
      if (params.args && params.args.length > 0) {
        const path = params.args[0];
        await this.changeDirectory(path);
      } else {
        // :cd without args - show current directory (same as :pwd)
        const dir = this.currentDirectory || '(not set)';
        this.fileStatus.textContent = dir;
        setTimeout(() => {
          if (this.fileStatus.textContent === dir) {
            this.fileStatus.textContent = this.modified ? '(modified)' : '';
          }
        }, 5000);
      }
    });
  }

  private async changeDirectory(path: string): Promise<void> {
    if (!tauriFs || !tauriPath) {
      this.fileStatus.textContent = '(cd not available in browser)';
      return;
    }

    try {
      let targetPath = path;
      
      // Handle ~ for home directory
      if (path.startsWith('~')) {
        const homeDir = await tauriPath.homeDir();
        targetPath = path.replace(/^~/, homeDir.replace(/[/\\]$/, ''));
      }
      // Handle relative paths
      else if (!path.match(/^[a-zA-Z]:/) && !path.startsWith('/')) {
        if (this.currentDirectory) {
          targetPath = this.currentDirectory + '/' + path;
        }
      }
      
      // Normalize path separators
      targetPath = targetPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
      
      // Verify directory exists by trying to read it
      try {
        await tauriFs.readDir(targetPath);
        this.currentDirectory = targetPath;
        this.fileStatus.textContent = `cd: ${targetPath}`;
        setTimeout(() => {
          if (this.fileStatus.textContent === `cd: ${targetPath}`) {
            this.fileStatus.textContent = this.modified ? '(modified)' : '';
          }
        }, 3000);
      } catch {
        this.fileStatus.textContent = `(directory not found: ${path})`;
      }
    } catch (err) {
      console.error('Failed to change directory:', err);
      this.fileStatus.textContent = '(cd failed)';
    }
  }

  private getDirectoryFromPath(filePath: string): string {
    // Extract directory from file path
    const normalized = filePath.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash > 0 ? normalized.substring(0, lastSlash) : normalized;
  }

  private resolvePath(filename: string): string {
    // If absolute path, return as-is
    if (filename.match(/^[a-zA-Z]:/) || filename.startsWith('/')) {
      return filename;
    }
    // If we have a current directory, resolve relative to it
    if (this.currentDirectory) {
      return `${this.currentDirectory}/${filename}`;
    }
    // Otherwise return as-is
    return filename;
  }

  private promptAndFetchUrl(): void {
    const url = prompt('Enter URL to fetch markdown from:\n(Qiita, GitHub, etc.)');
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      this.fetchMarkdownFromUrl(url);
    } else if (url) {
      this.fileStatus.textContent = '(invalid URL)';
    }
  }

  private async yankToClipboard(): Promise<void> {
    const selection = this.editor.getSelection();
    if (selection && !selection.isEmpty()) {
      const text = this.editor.getModel()?.getValueInRange(selection) || '';
      try {
        await navigator.clipboard.writeText(text);
        this.fileStatus.textContent = '(copied to clipboard)';
        setTimeout(() => {
          if (!this.modified) this.fileStatus.textContent = '';
        }, 1500);
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        this.fileStatus.textContent = '(clipboard error)';
      }
    } else {
      // Copy current line if no selection
      const position = this.editor.getPosition();
      if (position) {
        const model = this.editor.getModel();
        if (model) {
          const lineContent = model.getLineContent(position.lineNumber);
          try {
            await navigator.clipboard.writeText(lineContent + '\n');
            this.fileStatus.textContent = '(line copied)';
            setTimeout(() => {
              if (!this.modified) this.fileStatus.textContent = '';
            }, 1500);
          } catch (err) {
            console.error('Failed to copy to clipboard:', err);
          }
        }
      }
    }
  }

  private async pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      const position = this.editor.getPosition();
      if (position && text) {
        this.editor.executeEdits('clipboard-paste', [{
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          text: text,
        }]);
        this.modified = true;
        this.fileStatus.textContent = '(modified)';
      }
    } catch (err) {
      console.error('Failed to paste from clipboard:', err);
      this.fileStatus.textContent = '(clipboard error)';
    }
  }

  private setupListAutoContinue(): void {
    // Add Enter key handler for list auto-continuation
    this.editor.addCommand(monaco.KeyCode.Enter, () => {
      const position = this.editor.getPosition();
      if (!position) {
        // Fallback to default behavior
        this.editor.trigger('keyboard', 'type', { text: '\n' });
        return;
      }

      const model = this.editor.getModel();
      if (!model) {
        this.editor.trigger('keyboard', 'type', { text: '\n' });
        return;
      }

      const lineContent = model.getLineContent(position.lineNumber);
      
      // Check for various list patterns
      // Unordered: - item, * item, + item
      // Ordered: 1. item, 1) item
      // Checkbox: - [ ] item, - [x] item
      const listPatterns = [
        // Checkbox (unchecked)
        { regex: /^(\s*)-\s*\[\s*\]\s+(.*)$/, getNext: (m: RegExpMatchArray) => `${m[1]}- [ ] ` },
        // Checkbox (checked) - continue with unchecked
        { regex: /^(\s*)-\s*\[[xX]\]\s+(.*)$/, getNext: (m: RegExpMatchArray) => `${m[1]}- [ ] ` },
        // Unordered list with -, *, +
        { regex: /^(\s*)([-*+])\s+(.*)$/, getNext: (m: RegExpMatchArray) => `${m[1]}${m[2]} ` },
        // Ordered list with number and dot: 1. 2. etc
        { regex: /^(\s*)(\d+)\.\s+(.*)$/, getNext: (m: RegExpMatchArray) => `${m[1]}${parseInt(m[2]) + 1}. ` },
        // Ordered list with number and paren: 1) 2) etc
        { regex: /^(\s*)(\d+)\)\s+(.*)$/, getNext: (m: RegExpMatchArray) => `${m[1]}${parseInt(m[2]) + 1}) ` },
        // Blockquote
        { regex: /^(\s*>\s*)(.*)$/, getNext: (m: RegExpMatchArray) => m[1] },
      ];

      for (const pattern of listPatterns) {
        const match = lineContent.match(pattern.regex);
        if (match) {
          // Get the content after the list marker
          const contentIndex = pattern.regex.source.includes('\\[') ? 2 : (match.length - 1);
          const content = match[contentIndex] || '';
          
          // If line is empty (just the marker), remove the marker and add blank line
          if (content.trim() === '') {
            const indent = match[1] || '';
            // Delete current line content and just add newline
            this.editor.executeEdits('list-continue', [{
              range: new monaco.Range(
                position.lineNumber, 1,
                position.lineNumber, lineContent.length + 1
              ),
              text: indent,
            }]);
            return;
          }
          
          // Insert new line with list continuation
          const nextPrefix = pattern.getNext(match);
          this.editor.executeEdits('list-continue', [{
            range: new monaco.Range(
              position.lineNumber, position.column,
              position.lineNumber, position.column
            ),
            text: '\n' + nextPrefix,
          }]);
          
          // Move cursor to end of inserted prefix
          const newPos = new monaco.Position(position.lineNumber + 1, nextPrefix.length + 1);
          this.editor.setPosition(newPos);
          return;
        }
      }

      // No list pattern matched, do default Enter behavior
      this.editor.trigger('keyboard', 'type', { text: '\n' });
    });

    // Tab key - increase indent for list items
    this.editor.addCommand(monaco.KeyCode.Tab, () => {
      if (this.handleListIndent(true)) return;
      // Default tab behavior
      this.editor.trigger('keyboard', 'type', { text: '\t' });
    });

    // Shift+Tab - decrease indent for list items
    this.editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Tab, () => {
      if (this.handleListIndent(false)) return;
      // Default shift-tab behavior (outdent)
      this.editor.trigger('keyboard', 'editor.action.outdentLines', {});
    });
  }

  private handleListIndent(increase: boolean): boolean {
    const position = this.editor.getPosition();
    if (!position) return false;

    const model = this.editor.getModel();
    if (!model) return false;

    const lineContent = model.getLineContent(position.lineNumber);
    
    // Check if current line is a list item
    const listPattern = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/;
    const match = lineContent.match(listPattern);
    
    if (!match) return false;

    const currentIndent = match[1];
    const marker = match[2];
    const checkbox = match[3] || '';
    const content = match[4];
    const indentUnit = '  '; // 2 spaces

    let newIndent: string;
    
    if (increase) {
      // Add indent
      newIndent = currentIndent + indentUnit;
    } else {
      // Remove indent (minimum 0)
      if (currentIndent.length >= indentUnit.length) {
        newIndent = currentIndent.slice(indentUnit.length);
      } else {
        newIndent = '';
      }
    }

    // Reconstruct the line
    const newLine = `${newIndent}${marker} ${checkbox}${content}`;
    
    // Calculate cursor position adjustment
    const indentDiff = newIndent.length - currentIndent.length;
    const newColumn = Math.max(1, position.column + indentDiff);

    // Replace the line
    this.editor.executeEdits('list-indent', [{
      range: new monaco.Range(
        position.lineNumber, 1,
        position.lineNumber, lineContent.length + 1
      ),
      text: newLine,
    }]);

    // Restore cursor position
    this.editor.setPosition(new monaco.Position(position.lineNumber, newColumn));
    
    return true;
  }

  private handleSetCommand(argString: string): void {
    const arg = argString.trim().toLowerCase();
    
    // :set wrap / :set nowrap
    if (arg === 'wrap') {
      this.setWrap(true);
      return;
    }
    if (arg === 'nowrap') {
      this.setWrap(false);
      return;
    }

    // :set theme=xxx
    const themeMatch = arg.match(/^theme=(\w+(?:-\w+)?)$/);
    if (themeMatch) {
      const themeName = themeMatch[1] as Theme;
      const validThemes: Theme[] = ['dark', 'light', 'monokai', 'solarized-dark', 'solarized-light', 'nord', 'dracula', 'github-dark', 'github-light'];
      if (validThemes.includes(themeName)) {
        this.setTheme(themeName);
      }
      return;
    }

    // :set tabsize=N / :set ts=N
    const tabMatch = arg.match(/^(?:tabsize|ts)=(\d+)$/);
    if (tabMatch) {
      this.setTabSize(parseInt(tabMatch[1], 10));
      return;
    }

    // :set fontsize=N / :set fs=N
    const fontMatch = arg.match(/^(?:fontsize|fs)=(\d+)$/);
    if (fontMatch) {
      this.setFontSize(parseInt(fontMatch[1], 10));
      return;
    }

    // :set vim / :set novim
    if (arg === 'vim') {
      if (!this.settings.vimEnabled) {
        this.toggleVimMode();
      }
      return;
    }
    if (arg === 'novim') {
      if (this.settings.vimEnabled) {
        this.toggleVimMode();
      }
      return;
    }

    // :set number / :set nonumber
    if (arg === 'number' || arg === 'nu') {
      this.editor.updateOptions({ lineNumbers: 'on' });
      return;
    }
    if (arg === 'nonumber' || arg === 'nonu') {
      this.editor.updateOptions({ lineNumbers: 'off' });
      return;
    }

    // :set minimap / :set nominimap
    if (arg === 'minimap') {
      this.editor.updateOptions({ minimap: { enabled: true } });
      return;
    }
    if (arg === 'nominimap') {
      this.editor.updateOptions({ minimap: { enabled: false } });
      return;
    }

    // :set autosave / :set noautosave
    if (arg === 'autosave') {
      this.settings.autoSave = true;
      this.initAutoSave();
      this.saveSettings();
      this.fileStatus.textContent = '(autosave enabled)';
      setTimeout(() => { if (!this.modified) this.fileStatus.textContent = ''; }, 2000);
      return;
    }
    if (arg === 'noautosave') {
      this.settings.autoSave = false;
      this.initAutoSave();
      this.saveSettings();
      this.fileStatus.textContent = '(autosave disabled)';
      setTimeout(() => { if (!this.modified) this.fileStatus.textContent = ''; }, 2000);
      return;
    }

    // :set autosaveinterval=N
    const autoSaveIntervalMatch = arg.match(/^autosaveinterval=(\d+)$/);
    if (autoSaveIntervalMatch) {
      const interval = parseInt(autoSaveIntervalMatch[1], 10);
      if (interval >= 5 && interval <= 300) {
        this.settings.autoSaveInterval = interval;
        this.initAutoSave();
        this.saveSettings();
        this.fileStatus.textContent = `(autosave interval: ${interval}s)`;
        setTimeout(() => { if (!this.modified) this.fileStatus.textContent = ''; }, 2000);
      }
      return;
    }

    console.log('Unknown set option:', arg);
  }

  private quit(force: boolean = false): void {
    if (this.modified && !force) {
      // Show warning in statusbar
      this.fileStatus.textContent = '(unsaved changes - use :q! to force)';
      return;
    }
    // In Tauri, we would close the window
    // For now, just clear the editor
    if (tauriDialog) {
      // Close window via Tauri
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().close();
      }).catch(() => {
        this.newFile();
      });
    } else {
      this.newFile();
    }
  }

  private async openFileByPath(filePath: string): Promise<void> {
    if (!tauriFs) {
      console.log('File open not available in browser mode');
      return;
    }

    try {
      // Resolve relative path
      const resolvedPath = this.resolvePath(filePath);
      
      // Check if it's a .mdvim file
      if (resolvedPath.endsWith('.mdvim')) {
        await this.loadMdvim(resolvedPath);
        // Set current directory from opened file
        this.currentDirectory = this.getDirectoryFromPath(resolvedPath);
        return;
      }
      
      // Read as binary for encoding detection
      const binaryData = await tauriFs.readFile(resolvedPath);
      const content = this.decodeWithAutoDetect(new Uint8Array(binaryData));
      
      this.editor.setValue(content);
      this.currentFilePath = resolvedPath;
      this.currentDirectory = this.getDirectoryFromPath(resolvedPath);
      this.fileName = resolvedPath.split(/[/\\]/).pop() || 'Untitled';
      this.fileNameEl.textContent = this.fileName;
      this.modified = false;
      this.fileStatus.textContent = '';
      this.images.clear();
    } catch (err) {
      this.fileStatus.textContent = `(file not found: ${filePath})`;
      console.error('Failed to open file:', err);
    }
  }

  private async fetchMarkdownFromUrl(url: string): Promise<void> {
    this.fileStatus.textContent = '(fetching...)';
    
    try {
      // Normalize URL for known services
      let markdownUrl = this.normalizeMarkdownUrl(url);
      
      let content: string;
      
      // Use Tauri HTTP client if available (bypasses CORS)
      if (tauriHttp) {
        const response = await tauriHttp.fetch(markdownUrl, {
          method: 'GET',
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        content = await response.text();
      } else {
        // Fallback to browser fetch (may fail due to CORS)
        const response = await fetch(markdownUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        content = await response.text();
      }
      
      // Extract base URL for relative image paths
      const baseUrl = this.getBaseUrl(url);
      
      // Process and embed images
      content = await this.processAndEmbedImages(content, baseUrl);
      
      // Set the content
      this.editor.setValue(content);
      this.currentFilePath = null;
      this.fileName = this.getFileNameFromUrl(url);
      this.fileNameEl.textContent = this.fileName;
      this.modified = true; // Mark as modified since it's fetched
      this.fileStatus.textContent = '(fetched from web)';
      
      setTimeout(() => {
        if (this.modified) this.fileStatus.textContent = '(modified)';
      }, 2000);
      
    } catch (err) {
      console.error('Failed to fetch markdown:', err);
      this.fileStatus.textContent = `(fetch failed: ${err})`;
    }
  }

  private normalizeMarkdownUrl(url: string): string {
    // Remove trailing slash
    url = url.replace(/\/$/, '');
    
    // Qiita: Add .md extension if not present
    if (url.includes('qiita.com/') && !url.endsWith('.md')) {
      // Pattern: https://qiita.com/username/items/itemid
      if (/qiita\.com\/[^/]+\/items\/[a-f0-9]+$/i.test(url)) {
        return url + '.md';
      }
    }
    
    // GitHub: Convert blob URL to raw URL
    if (url.includes('github.com/') && url.includes('/blob/')) {
      // https://github.com/user/repo/blob/branch/path/file.md
      // -> https://raw.githubusercontent.com/user/repo/branch/path/file.md
      return url
        .replace('github.com/', 'raw.githubusercontent.com/')
        .replace('/blob/', '/');
    }
    
    // GitHub Gist: Get raw content
    if (url.includes('gist.github.com/')) {
      if (!url.includes('/raw')) {
        return url + '/raw';
      }
    }
    
    // Zenn: Articles have special format
    if (url.includes('zenn.dev/') && !url.endsWith('.md')) {
      // Zenn doesn't provide raw markdown easily, keep as is
    }
    
    return url;
  }

  private getBaseUrl(url: string): string {
    // Get the base URL for resolving relative image paths
    try {
      const urlObj = new URL(url);
      
      // For Qiita, images are usually absolute
      if (urlObj.hostname.includes('qiita.com')) {
        return 'https://qiita-image-store.s3.ap-northeast-1.amazonaws.com';
      }
      
      // For GitHub, use raw.githubusercontent.com
      if (urlObj.hostname.includes('github.com') || urlObj.hostname.includes('raw.githubusercontent.com')) {
        // Extract up to the directory
        const pathParts = urlObj.pathname.split('/');
        pathParts.pop(); // Remove filename
        return urlObj.origin + pathParts.join('/');
      }
      
      // Default: use the URL's directory
      const pathParts = urlObj.pathname.split('/');
      pathParts.pop();
      return urlObj.origin + pathParts.join('/');
    } catch {
      return '';
    }
  }

  private getFileNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Qiita: Use item ID
      const qiitaMatch = pathname.match(/\/items\/([a-f0-9]+)/i);
      if (qiitaMatch) {
        return `qiita-${qiitaMatch[1]}.md`;
      }
      
      // GitHub: Use filename
      const parts = pathname.split('/');
      const filename = parts.pop() || '';
      if (filename.endsWith('.md')) {
        return filename;
      }
      
      // Default: Use last path segment
      return (filename || 'web-import') + '.md';
    } catch {
      return 'web-import.md';
    }
  }

  private async processAndEmbedImages(content: string, baseUrl: string): Promise<string> {
    // Find all image references in markdown
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const matches = [...content.matchAll(imageRegex)];
    
    for (const match of matches) {
      const [fullMatch, alt, imageUrl] = match;
      
      try {
        // Resolve relative URLs
        let absoluteUrl = imageUrl;
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) {
          if (imageUrl.startsWith('/')) {
            // Absolute path from root
            const urlObj = new URL(baseUrl);
            absoluteUrl = urlObj.origin + imageUrl;
          } else {
            // Relative path
            absoluteUrl = baseUrl + '/' + imageUrl;
          }
        }
        
        // Skip data URLs
        if (absoluteUrl.startsWith('data:')) {
          continue;
        }
        
        // Fetch and embed the image
        const imageData = await this.fetchAndEmbedImage(absoluteUrl);
        if (imageData) {
          // Replace the image reference with embedded image
          const newRef = `![${alt}](images/${imageData.id})`;
          content = content.replace(fullMatch, newRef);
        }
      } catch (err) {
        console.warn('Failed to fetch image:', imageUrl, err);
        // Keep original reference if fetch fails
      }
    }
    
    return content;
  }

  private async fetchAndEmbedImage(url: string): Promise<EmbeddedImage | null> {
    try {
      let base64: string;
      let mimeType: string;
      
      // Use Tauri HTTP client if available (bypasses CORS)
      if (tauriHttp) {
        const response = await tauriHttp.fetch(url, {
          method: 'GET',
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        mimeType = this.guessMimeType(url);
      } else {
        // Fallback to browser fetch
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        mimeType = blob.type || this.guessMimeType(url);
        const buffer = await blob.arrayBuffer();
        base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
      }
      
      // Generate unique ID
      const id = this.generateImageIdFromUrl(url);
      const ext = this.getExtensionFromMime(mimeType);
      const filename = `${id}${ext}`;
      
      const imageData: EmbeddedImage = {
        id: filename,
        filename: filename,
        mimeType: mimeType,
        data: base64
      };
      
      this.images.set(filename, imageData);
      return imageData;
      
    } catch (err) {
      console.warn('Failed to fetch image:', url, err);
      return null;
    }
  }

  private guessMimeType(url: string): string {
    const ext = url.split('.').pop()?.toLowerCase().split('?')[0];
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
    };
    return mimeTypes[ext || ''] || 'image/png';
  }

  private generateImageIdFromUrl(url: string): string {
    // Generate a simple hash from URL
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `web-${Math.abs(hash).toString(16)}`;
  }

  private getExtensionFromMime(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    return extensions[mimeType] || '.png';
  }

  private async saveFileWithName(suggestedName: string): Promise<void> {
    if (!tauriDialog || !tauriFs) {
      console.log('File save not available in browser mode');
      return;
    }

    // Open save dialog with suggested filename
    const isMdvim = suggestedName.endsWith('.mdvim');
    const filters = isMdvim 
      ? [{ name: 'mdvim', extensions: ['mdvim'] }, { name: 'Markdown', extensions: ['md'] }]
      : [{ name: 'Markdown', extensions: ['md'] }, { name: 'mdvim', extensions: ['mdvim'] }];

    // Use current directory for default path
    const defaultPath = this.currentDirectory 
      ? `${this.currentDirectory}/${suggestedName}`
      : suggestedName;

    const filePath = await tauriDialog.save({
      filters,
      defaultPath
    });

    if (!filePath) return; // User cancelled

    try {
      if (filePath.endsWith('.mdvim')) {
        await this.saveMdvim(filePath);
      } else {
        await tauriFs.writeTextFile(filePath, this.editor.getValue());
        this.currentFilePath = filePath;
        this.currentDirectory = this.getDirectoryFromPath(filePath);
        this.fileName = filePath.split(/[/\\]/).pop() || 'Untitled';
        this.fileNameEl.textContent = this.fileName;
        this.modified = false;
        this.fileStatus.textContent = '(saved)';
        setTimeout(() => {
          if (!this.modified) this.fileStatus.textContent = '';
        }, 2000);
      }
    } catch (err) {
      this.fileStatus.textContent = '(save failed)';
      console.error('Failed to save file:', err);
    }
  }

  private async exportToHtml(): Promise<void> {
    if (!tauriDialog || !tauriFs) {
      console.log('Export not available in browser mode');
      return;
    }

    const filePath = await tauriDialog.save({
      filters: [{ name: 'HTML', extensions: ['html'] }],
      defaultPath: this.fileName.replace(/\.[^.]+$/, '') + '.html'
    });

    if (filePath) {
      let content = this.editor.getValue();
      
      // Process image size syntax
      content = this.processImageSize(content);
      
      // Process mermaid blocks - convert to HTML placeholder before markdown parsing
      const mermaidData: Array<{ attrs: string; code: string }> = [];
      
      content = content.replace(
        /```mermaid\s*(?:\{([^}]*)\})?\s*\n([\s\S]*?)```/g,
        (_, attrs, code) => {
          const index = mermaidData.length;
          mermaidData.push({ attrs: attrs || '', code: code.trim() });
          // Use HTML comment as placeholder to survive markdown parsing
          return `<div data-mermaid-index="${index}"></div>`;
        }
      );
      
      // Parse markdown
      let htmlContent = marked.parse(content, { async: false }) as string;
      
      // Replace images/filename with Base64 data URLs
      htmlContent = htmlContent.replace(/src="images\/([^"]+)"/g, (_match, imageId) => {
        const dataUrl = this.getImageDataUrl(imageId);
        if (dataUrl) {
          return `src="${dataUrl}"`;
        }
        return `src="images/${imageId}"`;
      });
      
      // Render mermaid diagrams and replace placeholders
      for (let i = 0; i < mermaidData.length; i++) {
        const { attrs, code } = mermaidData[i];
        const placeholder = `<div data-mermaid-index="${i}"></div>`;
        
        try {
          const id = `mermaid-export-${Date.now()}-${i}`;
          const { svg } = await mermaid.render(id, code);
          
          // Parse attributes for styling
          let style = '';
          let containerStyle = '';
          
          const widthMatch = attrs.match(/width\s*=\s*(\d+%?)/);
          if (widthMatch) style += `width: ${widthMatch[1]};`;
          
          const heightMatch = attrs.match(/height\s*=\s*(\d+%?)/);
          if (heightMatch) style += `height: ${heightMatch[1]};`;
          
          const alignMatch = attrs.match(/align\s*=\s*(\w+)/);
          if (alignMatch) {
            if (alignMatch[1] === 'center') containerStyle = 'text-align: center;';
            else if (alignMatch[1] === 'right') containerStyle = 'text-align: right;';
          }
          
          const styleAttr = style ? ` style="${style}"` : '';
          const containerStyleAttr = containerStyle ? ` style="${containerStyle}"` : '';
          
          const mermaidHtml = `<div class="mermaid-diagram"${containerStyleAttr}><div${styleAttr}>${svg}</div></div>`;
          htmlContent = htmlContent.replace(placeholder, mermaidHtml);
        } catch (err) {
          console.error('Mermaid render error during export:', err);
          htmlContent = htmlContent.replace(placeholder, `<pre style="color: red;">Mermaid Error: ${err}</pre>`);
        }
      }
      
      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.fileName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
    pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; border-radius: 4px; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 1rem; color: #666; }
    img { max-width: 100%; height: auto; }
    .mermaid-diagram { margin: 1em 0; }
    .mermaid-diagram svg { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 0.5em; text-align: left; }
    th { background: #f4f4f4; }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`;
      
      try {
        await tauriFs.writeTextFile(filePath, fullHtml);
        this.fileStatus.textContent = '(exported)';
        setTimeout(() => {
          if (!this.modified) this.fileStatus.textContent = '';
        }, 2000);
      } catch (err) {
        this.fileStatus.textContent = '(export failed)';
        console.error('Failed to export:', err);
      }
    }
  }

  private toggleHelp(): void {
    // Toggle help modal
    const helpModal = document.getElementById('help-modal');
    if (helpModal) {
      helpModal.classList.toggle('hidden');
    }
  }

  private async exportToPdf(): Promise<void> {
    // Dynamic import for PDF libraries
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import('jspdf'),
      import('html2canvas')
    ]);

    // Create a temporary container for rendering
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: 210mm;
      padding: 20mm;
      background: white;
      color: black;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12pt;
      line-height: 1.6;
    `;
    
    // Get rendered HTML content
    tempDiv.innerHTML = this.preview.innerHTML;
    
    // Force black color for all KaTeX elements in PDF
    const katexElements = tempDiv.querySelectorAll('.katex, .katex *');
    katexElements.forEach(el => {
      (el as HTMLElement).style.color = 'black';
    });
    
    document.body.appendChild(tempDiv);
    
    try {
      this.fileStatus.textContent = '(generating PDF...)';
      
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      
      // Handle multi-page content
      const pageHeight = pdfHeight * (imgWidth / pdfWidth);
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', imgX, 0, imgWidth * ratio, imgHeight * ratio);
      heightLeft -= pageHeight;
      
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', imgX, position * ratio, imgWidth * ratio, imgHeight * ratio);
        heightLeft -= pageHeight;
      }
      
      // Save PDF
      if (tauriDialog && tauriFs) {
        const filePath = await tauriDialog.save({
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          defaultPath: this.fileName.replace(/\.[^.]+$/, '') + '.pdf'
        });
        
        if (filePath) {
          const pdfBlob = pdf.output('arraybuffer');
          await tauriFs.writeFile(filePath, new Uint8Array(pdfBlob));
          this.fileStatus.textContent = '(PDF exported)';
        } else {
          this.fileStatus.textContent = '';
        }
      } else {
        // Browser mode - download directly
        pdf.save(this.fileName.replace(/\.[^.]+$/, '') + '.pdf');
        this.fileStatus.textContent = '(PDF downloaded)';
      }
      
      setTimeout(() => {
        if (!this.modified) this.fileStatus.textContent = '';
      }, 2000);
    } catch (err) {
      console.error('PDF export error:', err);
      this.fileStatus.textContent = '(PDF export failed)';
    } finally {
      document.body.removeChild(tempDiv);
    }
  }

  private toggleToc(): void {
    this.tocPane.classList.toggle('hidden');
    if (!this.tocPane.classList.contains('hidden')) {
      this.updateToc();
    }
    this.editor.layout();
  }

  private setupTocResizer(): void {
    const resizer = document.getElementById('toc-resizer');
    if (!resizer) return;

    // Clear any cached inline styles on startup
    this.tocPane.style.width = '';
    this.tocPane.style.minWidth = '';
    this.tocPane.style.maxWidth = '';
    this.tocPane.style.flexBasis = '';

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = this.tocPane.getBoundingClientRect().width;
      resizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      e.preventDefault();
      
      const diff = e.clientX - startX;
      const newWidth = Math.max(100, Math.min(400, startWidth + diff));
      this.tocPane.style.width = `${newWidth}px`;
      this.tocPane.style.flexBasis = `${newWidth}px`;
      this.editor.layout();
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        this.editor.layout();
      }
    });
  }

  private updateToc(): void {
    const content = this.editor.getValue();
    const headings: { level: number; text: string; line: number }[] = [];
    
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      // Only match H1-H3 (#{1,3})
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          line: index + 1
        });
      }
    });

    if (headings.length === 0) {
      this.tocContent.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem;">No headings found</p>';
      return;
    }

    const ul = document.createElement('ul');
    headings.forEach(h => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = h.text;
      a.className = `toc-h${h.level}`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.editor.revealLineInCenter(h.line);
        this.editor.setPosition({ lineNumber: h.line, column: 1 });
        this.editor.focus();
      });
      li.appendChild(a);
      ul.appendChild(li);
    });

    this.tocContent.innerHTML = '';
    this.tocContent.appendChild(ul);
  }

  private toggleVimMode(): void {
    this.settings.vimEnabled = !this.settings.vimEnabled;
    this.initVimMode();
    this.vimToggleBtn.classList.toggle('active', this.settings.vimEnabled);
    this.saveSettings();
    this.editor.focus();
  }

  // ========== Event Listeners ==========

  private setupEventListeners(): void {
    // Editor content change
    this.editor.onDidChangeModelContent(() => {
      this.modified = true;
      this.fileStatus.textContent = '(modified)';
      this.updatePreviewDebounced();
      this.updateStats();
      // Update TOC if visible
      if (!this.tocPane.classList.contains('hidden')) {
        this.updateTocDebounced();
      }
    });

    // Cursor position change
    this.editor.onDidChangeCursorPosition(() => {
      this.updateCursorPosition();
    });

    // Setup list auto-continuation on Enter
    this.setupListAutoContinue();

    // View mode buttons
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = (e.target as HTMLElement).dataset.view as ViewMode;
        this.setViewMode(view);
      });
    });

    // Theme selector
    this.themeSelector.addEventListener('change', () => {
      this.setTheme(this.themeSelector.value as Theme);
    });

    // Font size buttons
    document.getElementById('btn-font-smaller')?.addEventListener('click', () => {
      this.setFontSize(this.settings.fontSize - 10);
    });
    document.getElementById('btn-font-larger')?.addEventListener('click', () => {
      this.setFontSize(this.settings.fontSize + 10);
    });

    // Vim toggle
    this.vimToggleBtn.addEventListener('click', () => {
      this.toggleVimMode();
    });

    // Image insert button
    document.getElementById('btn-insert-image')?.addEventListener('click', () => {
      this.selectAndInsertImage();
    });

    // Fold/Unfold buttons
    document.getElementById('btn-fold-all')?.addEventListener('click', () => {
      this.foldAll();
    });
    document.getElementById('btn-unfold-all')?.addEventListener('click', () => {
      this.unfoldAll();
    });

    // TOC toggle button
    document.getElementById('btn-toc-toggle')?.addEventListener('click', () => {
      this.toggleToc();
    });
    document.getElementById('btn-toc-close')?.addEventListener('click', () => {
      this.toggleToc();
    });

    // TOC resizer
    this.setupTocResizer();

    // Editor scroll -> sync preview
    this.editor.onDidScrollChange(() => {
      this.scheduleScrollSync('editor');
    });

    // Preview scroll -> sync editor
    this.preview.addEventListener(
      'scroll',
      () => {
        this.scheduleScrollSync('preview');
      },
      { passive: true }
    );

    // Paste image handling - use capture phase to intercept before Monaco
    document.addEventListener('paste', (e) => {
      // Only handle if editor is focused
      if (this.editor.hasTextFocus()) {
        this.handlePaste(e as ClipboardEvent);
      }
    }, true);

    // Drag and drop image handling - handle on main content area
    const mainContent = document.getElementById('main-content')!;
    
    mainContent.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.editorContainer.classList.add('drag-over');
    });
    
    mainContent.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    
    mainContent.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Only remove highlight if leaving main content
      const rect = mainContent.getBoundingClientRect();
      if (e.clientX <= rect.left || e.clientX >= rect.right || 
          e.clientY <= rect.top || e.clientY >= rect.bottom) {
        this.editorContainer.classList.remove('drag-over');
      }
    });
    
    mainContent.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.editorContainer.classList.remove('drag-over');
      console.log('Drop event on main content');
      this.handleDrop(e as DragEvent);
    });

    // Window resize
    window.addEventListener('resize', () => {
      this.editor.layout();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      // Close help modal on Escape
      if (e.key === 'Escape') {
        const helpModal = document.getElementById('help-modal');
        if (helpModal && !helpModal.classList.contains('hidden')) {
          helpModal.classList.add('hidden');
          e.preventDefault();
          return;
        }
      }
      
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        this.openFile();
      } else if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        this.saveFileAs();
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this.saveFile();
      } else if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        this.newFile();
      } else if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        this.toggleVimMode();
      } else if (e.key === 'F1') {
        e.preventDefault();
        this.toggleHelp();
      }
    });

    // Help modal close button
    document.getElementById('help-close-btn')?.addEventListener('click', () => {
      this.toggleHelp();
    });

    // Click outside modal to close
    document.getElementById('help-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.toggleHelp();
      }
    });
  }

  // ========== Settings Setters ==========

  private setViewMode(mode: ViewMode): void {
    this.settings.viewMode = mode;
    document.getElementById('app')!.dataset.viewMode = mode;

    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === mode);
    });

    setTimeout(() => this.editor.layout(), 0);
    this.saveSettings();
  }

  private setTheme(theme: Theme): void {
    this.settings.theme = theme;
    document.documentElement.dataset.theme = theme;
    monaco.editor.setTheme(monacoThemeMap[theme]);
    this.themeSelector.value = theme;
    this.saveSettings();
  }

  private setFontSize(size: number): void {
    this.settings.fontSize = Math.max(50, Math.min(200, size));
    this.fontSizeDisplay.textContent = `${this.settings.fontSize}%`;
    this.editor.updateOptions({ fontSize: this.calculateFontSize() });
    this.saveSettings();
  }

  public setWrap(enabled: boolean): void {
    this.settings.wrap = enabled;
    this.editor.updateOptions({ wordWrap: enabled ? 'on' : 'off' });
    this.saveSettings();
  }

  public setTabSize(size: number): void {
    this.settings.tabSize = Math.max(1, Math.min(8, size));
    this.editor.updateOptions({ tabSize: this.settings.tabSize });
    this.saveSettings();
  }

  // ========== UI Updates ==========

  private syncScroll(): void {
    if (this.settings.viewMode !== 'split') return;
    
    const scrollTop = this.editor.getScrollTop();
    const scrollHeight = this.editor.getScrollHeight();
    const clientHeight = this.editor.getLayoutInfo().height;
    
    // Calculate scroll ratio
    const maxScroll = scrollHeight - clientHeight;
    const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    
    // Apply to preview using ratio
    const previewMaxScroll = this.preview.scrollHeight - this.preview.clientHeight;
    this.preview.scrollTop = ratio * previewMaxScroll;
  }

  private scheduleScrollSync(source: 'editor' | 'preview'): void {
    if (this.settings.viewMode !== 'split') return;

    // Prevent ping-pong: ignore events while the other side is driving the scroll
    if (this.scrollSyncLock && this.scrollSyncLock !== source) return;
    this.scrollSyncLock = source;

    if (this.scrollSyncRaf !== null) {
      cancelAnimationFrame(this.scrollSyncRaf);
    }

    this.scrollSyncRaf = requestAnimationFrame(() => {
      this.scrollSyncRaf = null;

      if (source === 'editor') {
        this.syncScrollFromEditor();
      } else {
        this.syncScrollFromPreview();
      }

      // Release lock on next frame so the user can immediately scroll the other pane
      requestAnimationFrame(() => {
        this.scrollSyncLock = null;
      });
    });
  }

  private syncScrollFromEditor(): void {
    if (this.settings.viewMode !== 'split') return;

    // Get the visible top line in editor
    const ranges = this.editor.getVisibleRanges();
    const topLine = ranges && ranges.length > 0
      ? ranges[0].startLineNumber
      : (this.editor.getPosition()?.lineNumber ?? 1);
    
    const model = this.editor.getModel();
    const totalLines = model?.getLineCount() ?? 1;
    
    // Try line-map based sync first
    if (this.previewLineMap.length >= 2) {
      const targetTop = this.interpolatePreviewPosition(topLine, totalLines);
      if (targetTop !== null) {
        if (Math.abs(targetTop - this.preview.scrollTop) < this.SCROLL_HYSTERESIS_PX) {
          return;
        }
        this.lastSyncedPreviewTop = targetTop;
        this.preview.scrollTop = targetTop;
        return;
      }
    }

    // Fallback: ratio-based
    const scrollTop = this.editor.getScrollTop();
    const scrollHeight = this.editor.getScrollHeight();
    const clientHeight = this.editor.getLayoutInfo().height;
    const maxScroll = scrollHeight - clientHeight;
    const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    
    const previewMaxScroll = this.preview.scrollHeight - this.preview.clientHeight;
    const targetTop = ratio * previewMaxScroll;
    
    if (Math.abs(targetTop - this.preview.scrollTop) < this.SCROLL_HYSTERESIS_PX) {
      return;
    }
    
    this.lastSyncedPreviewTop = targetTop;
    this.preview.scrollTop = targetTop;
  }

  private syncScrollFromPreview(): void {
    if (this.settings.viewMode !== 'split') return;

    // Try line-map based sync first
    if (this.previewLineMap.length >= 2) {
      const line = this.interpolateEditorLine(this.preview.scrollTop);
      if (line !== null) {
        const targetTop = this.editor.getTopForLineNumber(line);
        if (Math.abs(targetTop - this.editor.getScrollTop()) < this.SCROLL_HYSTERESIS_PX) {
          return;
        }
        this.lastSyncedPreviewTop = this.preview.scrollTop;
        this.editor.setScrollTop(targetTop);
        return;
      }
    }

    // Fallback: ratio-based
    const previewMaxScroll = this.preview.scrollHeight - this.preview.clientHeight;
    const ratio = previewMaxScroll > 0 ? this.preview.scrollTop / previewMaxScroll : 0;
    
    const editorScrollHeight = this.editor.getScrollHeight();
    const editorClientHeight = this.editor.getLayoutInfo().height;
    const editorMaxScroll = editorScrollHeight - editorClientHeight;
    const targetTop = ratio * editorMaxScroll;
    
    if (Math.abs(targetTop - this.editor.getScrollTop()) < this.SCROLL_HYSTERESIS_PX) {
      return;
    }
    
    this.lastSyncedPreviewTop = this.preview.scrollTop;
    this.editor.setScrollTop(targetTop);
  }

  private interpolatePreviewPosition(editorLine: number, totalLines: number): number | null {
    if (this.previewLineMap.length < 2) return null;
    
    const map = this.previewLineMap;
    const previewMaxScroll = this.preview.scrollHeight - this.preview.clientHeight;
    
    // Find surrounding anchors
    let lower = map[0];
    let upper = map[map.length - 1];
    
    for (let i = 0; i < map.length; i++) {
      if (map[i].line <= editorLine) {
        lower = map[i];
      }
      if (map[i].line >= editorLine && (upper.line > editorLine || i === map.length - 1)) {
        upper = map[i];
        break;
      }
    }
    
    // If at the same anchor
    if (lower.line === upper.line) {
      return Math.min(lower.top, previewMaxScroll);
    }
    
    // Linear interpolation between anchors
    const lineFraction = (editorLine - lower.line) / (upper.line - lower.line);
    const interpolatedTop = lower.top + lineFraction * (upper.top - lower.top);
    
    return Math.max(0, Math.min(interpolatedTop, previewMaxScroll));
  }

  private interpolateEditorLine(previewScrollTop: number): number | null {
    if (this.previewLineMap.length < 2) return null;
    
    const map = this.previewLineMap;
    
    // Find surrounding anchors
    let lower = map[0];
    let upper = map[map.length - 1];
    
    for (let i = 0; i < map.length; i++) {
      if (map[i].top <= previewScrollTop) {
        lower = map[i];
      }
      if (map[i].top >= previewScrollTop) {
        upper = map[i];
        break;
      }
    }
    
    // If at the same anchor
    if (lower.top === upper.top) {
      return lower.line;
    }
    
    // Linear interpolation between anchors
    const topFraction = (previewScrollTop - lower.top) / (upper.top - lower.top);
    const interpolatedLine = lower.line + topFraction * (upper.line - lower.line);
    
    return Math.round(interpolatedLine);
  }

  private rebuildPreviewLineMap(): void {
    if (!this.preview) return;

    const els = Array.from(this.preview.querySelectorAll<HTMLElement>('[data-src-line]'));
    const map: Array<{ line: number; top: number }> = [];

    const previewRect = this.preview.getBoundingClientRect();
    for (const el of els) {
      const lineStr = el.getAttribute('data-src-line');
      if (!lineStr) continue;
      const line = parseInt(lineStr, 10);
      if (!Number.isFinite(line)) continue;

      const rect = el.getBoundingClientRect();
      const top = (rect.top - previewRect.top) + this.preview.scrollTop;
      map.push({ line, top });
    }

    // Keep earliest top for each line (dedupe)
    map.sort((a, b) => (a.line - b.line) || (a.top - b.top));
    const deduped: Array<{ line: number; top: number }> = [];
    for (const item of map) {
      const last = deduped[deduped.length - 1];
      if (last && last.line === item.line) continue;
      deduped.push(item);
    }

    this.previewLineMap = deduped;
  }

  private getPreviewTopForLine(lineNumber: number): number | null {
    if (!this.previewLineMap.length) return null;

    let lo = 0;
    let hi = this.previewLineMap.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.previewLineMap[mid].line <= lineNumber) lo = mid + 1;
      else hi = mid;
    }
    const idx = Math.max(0, lo - 1);
    return this.previewLineMap[idx]?.top ?? null;
  }

  private getLineForPreviewScrollTop(scrollTop: number): number | null {
    if (!this.previewLineMap.length) return null;

    const y = scrollTop + 8;

    let lo = 0;
    let hi = this.previewLineMap.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.previewLineMap[mid].top <= y) lo = mid + 1;
      else hi = mid;
    }
    const idx = Math.max(0, lo - 1);
    return this.previewLineMap[idx]?.line ?? null;
  }

  private annotateTopLevelTokenLines(tokens: any[], src: string): void {
    const lineStarts: number[] = [0];
    for (let i = 0; i < src.length; i++) {
      if (src.charCodeAt(i) === 10) lineStarts.push(i + 1);
    }

    const indexToLine = (idx: number): number => {
      let lo = 0;
      let hi = lineStarts.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (lineStarts[mid] <= idx) lo = mid + 1;
        else hi = mid;
      }
      return Math.max(1, lo);
    };

    let cursor = 0;
    for (const tok of tokens) {
      const raw = tok?.raw;
      if (!raw || typeof raw !== 'string') continue;

      const pos = src.indexOf(raw, cursor);
      const start = pos >= 0 ? pos : cursor;

      tok.__srcLine = indexToLine(start);

      cursor = (pos >= 0 ? pos : cursor) + raw.length;
    }
  }

  private buildLineWrappedRenderer(): any {
    const baseRenderer = new (marked as any).Renderer();
    const wrap = (html: string, token: any): string => {
      const line = token?.__srcLine;
      if (!line || !Number.isFinite(line)) return html;
      return `<div class="md-block" data-src-line="${line}">${html}</div>`;
    };

    // Don't wrap headings - they need to be parsed by convertToFoldable
    const methodsToWrap = [
      'paragraph',
      'blockquote',
      'list',
      'code',
      'table',
      'hr',
      'html',
    ];

    for (const name of methodsToWrap) {
      const orig = (baseRenderer as any)[name];
      if (typeof orig !== 'function') continue;

      (baseRenderer as any)[name] = function (token: any, ...rest: any[]) {
        const inner = orig.call(this, token, ...rest);
        return wrap(inner, token);
      };
    }

    // Special handling for headings - add data-src-line as attribute instead of wrapper
    const origHeading = (baseRenderer as any).heading;
    if (typeof origHeading === 'function') {
      (baseRenderer as any).heading = function (token: any, ...rest: any[]) {
        const inner = origHeading.call(this, token, ...rest);
        const line = token?.__srcLine;
        if (line && Number.isFinite(line)) {
          // Add data-src-line attribute to the heading tag
          return inner.replace(/^<(h[1-6])/, `<$1 data-src-line="${line}"`);
        }
        return inner;
      };
    }

    return baseRenderer;
  }

  private syncScrollToCursor(): void {
    if (this.settings.viewMode !== 'split') return;
    
    const position = this.editor.getPosition();
    if (!position) return;

    // Prefer line-mapped scroll if we have anchors
    const mappedTop = this.getPreviewTopForLine(position.lineNumber);
    if (mappedTop !== null) {
      this.preview.scrollTo({ top: mappedTop, behavior: 'auto' });
      return;
    }
    
    // Fallback: ratio based on cursor line position
    const model = this.editor.getModel();
    if (!model) return;
    
    const totalLines = model.getLineCount();
    const ratio = totalLines > 1 ? (position.lineNumber - 1) / (totalLines - 1) : 0;
    
    const previewMaxScroll = this.preview.scrollHeight - this.preview.clientHeight;
    this.preview.scrollTo({ top: ratio * previewMaxScroll, behavior: 'auto' });
  }

  private scrollPreviewToLine(lineNumber: number): void {
    const mappedTop = this.getPreviewTopForLine(lineNumber);
    if (mappedTop !== null) {
      this.preview.scrollTop = mappedTop;
      return;
    }

    // Fallback: ratio-based scroll
    const model = this.editor.getModel();
    if (!model) return;
    
    const totalLines = model.getLineCount();
    const ratio = totalLines > 1 ? (lineNumber - 1) / (totalLines - 1) : 0;
    
    const previewMaxScroll = this.preview.scrollHeight - this.preview.clientHeight;
    this.preview.scrollTop = ratio * previewMaxScroll;
  }

  private updateCursorPosition(): void {
    const position = this.editor.getPosition();
    if (position) {
      this.cursorPos.textContent = `${position.lineNumber}:${position.column}`;
    }
  }

  private updateStats(): void {
    const content = this.editor.getValue();
    const lines = content.split('\n').length;
    const chars = content.length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    this.statsInfo.textContent = `${words} words | ${chars} chars | ${lines} lines`;
  }

  private previewTimeout: ReturnType<typeof setTimeout> | null = null;
  private tocTimeout: ReturnType<typeof setTimeout> | null = null;
  private scrollSyncTimeout: ReturnType<typeof setTimeout> | null = null;

  // Scroll sync (editor <-> preview) + line map
  private scrollSyncLock: 'editor' | 'preview' | null = null;
  private scrollSyncRaf: number | null = null;
  private previewLineMap: Array<{ line: number; top: number }> = [];
  
  // Hysteresis for scroll sync (prevent jitter at boundaries)
  private lastSyncedEditorLine: number = 0;
  private lastSyncedPreviewTop: number = 0;
  private readonly SCROLL_HYSTERESIS_PX: number = 8;  // Minimum pixel change to trigger sync
  private readonly LINE_HYSTERESIS: number = 1;       // Minimum line change to trigger sync

  private updatePreviewDebounced(): void {
    if (this.previewTimeout) clearTimeout(this.previewTimeout);
    this.previewTimeout = setTimeout(() => this.updatePreview(), 150);
  }

  private updateTocDebounced(): void {
    if (this.tocTimeout) clearTimeout(this.tocTimeout);
    this.tocTimeout = setTimeout(() => this.updateToc(), 300);
  }

  private syncScrollToCursorDebounced(): void {
    if (this.scrollSyncTimeout) clearTimeout(this.scrollSyncTimeout);
    this.scrollSyncTimeout = setTimeout(() => this.syncScrollToCursor(), 100);
  }

  private updatePreview(): void {
    try {
      let content = this.editor.getValue();
      
      // Process image size syntax: ![alt](path){width=300} or {width=300 height=200}
      content = this.processImageSize(content);
      
      // Process mermaid code blocks with attributes
      content = this.processMermaidBlocks(content);
      
      // Process math expressions (before other processing)
      content = this.processMath(content);
      
      // Process ruby (furigana) - Aozora Bunko style
      content = this.processRuby(content);
      
      // Convert Qiita notes to placeholder before markdown parsing
      const qiitaNotes: Array<{ type: string; body: string }> = [];
      content = content.replace(
        /^:::note\s*(info|warn|alert)?\s*\n([\s\S]*?)^:::\s*$/gm,
        (_, type, innerContent) => {
          const index = qiitaNotes.length;
          qiitaNotes.push({ type: type || 'info', body: innerContent.trim() });
          return `<!--QIITA_NOTE_${index}-->`;
        }
      );
      
      // Convert GitHub alerts to placeholder before markdown parsing
      const ghAlerts: Array<{ type: string; body: string }> = [];
      content = content.replace(
        /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n((?:>\s*.*(?:\n|$))*)/gm,
        (_, type, innerContent) => {
          const index = ghAlerts.length;
          const body = innerContent
            .split('\n')
            .map((line: string) => line.replace(/^>\s?/, ''))
            .join('\n')
            .trim();
          ghAlerts.push({ type, body });
          return `<!--GH_ALERT_${index}-->`;
        }
      );
      
      // Process footnotes before markdown parsing
      const footnotes: Map<string, string> = new Map();
      
      // Extract footnote definitions: [^id]: content
      content = content.replace(
        /^\[\^([^\]]+)\]:\s*(.+)$/gm,
        (_, id, body) => {
          footnotes.set(id, body.trim());
          return ''; // Remove definition from content
        }
      );
      
      // Replace footnote references with placeholders: [^id]
      content = content.replace(
        /\[\^([^\]]+)\]/g,
        (_, id) => `<!--FNREF_${id}-->`
      );
      
      // Process fold markers before markdown parsing
      let processedContent = this.processFoldMarkers(content);
      
      // Parse markdown with line-mapped blocks (for scroll sync)
      const tokens = marked.lexer(processedContent);
      this.annotateTopLevelTokenLines(tokens as any[], processedContent);
      const renderer = this.buildLineWrappedRenderer();
      const parsed = marked.parser(tokens as any, { renderer } as any);
      let html = typeof parsed === 'string' ? parsed : '';
      
      // Replace Qiita note placeholders with actual HTML (after markdown parsing)
      const noteConfig: Record<string, { icon: string; className: string }> = {
        'info': { icon: '✅', className: 'note info' },
        'warn': { icon: '⚠️', className: 'note warn' },
        'alert': { icon: '❌', className: 'note alert' },
      };
      html = html.replace(/<!--QIITA_NOTE_(\d+)-->/g, (_, indexStr) => {
        const index = parseInt(indexStr, 10);
        const note = qiitaNotes[index];
        if (!note) return '';
        const config = noteConfig[note.type] || noteConfig['info'];
        const bodyHtml = marked.parse(note.body);
        const bodyContent = typeof bodyHtml === 'string' ? bodyHtml : '';
        return `<div class="${config.className}"><span class="note-icon">${config.icon}</span><div class="note-content">${bodyContent}</div></div>`;
      });
      
      // Replace GitHub alert placeholders with actual HTML (after markdown parsing)
      const alertConfig: Record<string, { icon: string; className: string; label: string }> = {
        'NOTE': { icon: 'ℹ️', className: 'gh-alert alert-note', label: 'Note' },
        'TIP': { icon: '💡', className: 'gh-alert alert-tip', label: 'Tip' },
        'IMPORTANT': { icon: '📢', className: 'gh-alert alert-important', label: 'Important' },
        'WARNING': { icon: '⚠️', className: 'gh-alert alert-warning', label: 'Warning' },
        'CAUTION': { icon: '🚨', className: 'gh-alert alert-caution', label: 'Caution' },
      };
      html = html.replace(/<!--GH_ALERT_(\d+)-->/g, (_, indexStr) => {
        const index = parseInt(indexStr, 10);
        const alert = ghAlerts[index];
        if (!alert) return '';
        const config = alertConfig[alert.type] || alertConfig['NOTE'];
        const bodyHtml = marked.parse(alert.body);
        const bodyContent = typeof bodyHtml === 'string' ? bodyHtml : '';
        return `<div class="${config.className}"><p class="gh-alert-title">${config.icon} ${config.label}</p><div class="gh-alert-content">${bodyContent}</div></div>`;
      });
      
      // Replace footnote reference placeholders
      html = html.replace(/<!--FNREF_([^-]+)-->/g, (_, id) => {
        if (footnotes.has(id)) {
          return `<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}">[${id}]</a></sup>`;
        }
        return `<sup class="footnote-ref">[${id}]</sup>`;
      });
      
      // Add footnotes section at the end
      if (footnotes.size > 0) {
        let footnotesHtml = '<hr class="footnotes-sep"><section class="footnotes"><ol class="footnotes-list">';
        footnotes.forEach((content, id) => {
          const parsedContent = marked.parse(content);
          const contentHtml = typeof parsedContent === 'string' ? parsedContent.replace(/<\/?p>/g, '') : content;
          footnotesHtml += `<li id="fn-${id}" class="footnote-item"><p>${contentHtml} <a href="#fnref-${id}" class="footnote-backref">↩</a></p></li>`;
        });
        footnotesHtml += '</ol></section>';
        html += footnotesHtml;
      }
      
      // Restore math expressions
      const mathBlocks = (this as any)._mathBlocks as string[] || [];
      html = html.replace(/<!--MATH_BLOCK_(\d+)-->/g, (_, index) => {
        return mathBlocks[parseInt(index, 10)] || '';
      });
      html = html.replace(/<!--MATH_INLINE_(\d+)-->/g, (_, index) => {
        return mathBlocks[parseInt(index, 10)] || '';
      });
      
      // Replace images/filename references with data URLs
      html = html.replace(/src="images\/([^"]+)"/g, (_match, imageId) => {
        const dataUrl = this.getImageDataUrl(imageId);
        if (dataUrl) {
          return `src="${dataUrl}"`;
        }
        return `src="images/${imageId}"`;
      });
      
      // Convert headings to foldable sections
      html = this.convertToFoldable(html);
      
      if (this.preview) {
        this.preview.innerHTML = html;

        // Build initial line map for scroll sync
        this.rebuildPreviewLineMap();

        // Render mermaid diagrams (async) then rebuild the map again because layout changes
        this.renderMermaidDiagrams();
        // Rebuild map after a short delay to account for any layout changes
        setTimeout(() => this.rebuildPreviewLineMap(), 100);
      }
    } catch (err) {
      console.error('Preview error:', err);
      if (this.preview) {
        this.preview.innerHTML = `<p style="color:red;">Preview error: ${err}</p>`;
      }
    }
  }
  
  private processMermaidBlocks(content: string): string {
    // Convert ```mermaid {width=70% align=center} to special div
    // Pattern: ```mermaid {attrs}\n...\n```
    return content.replace(
      /```mermaid\s*(?:\{([^}]*)\})?\s*\n([\s\S]*?)```/g,
      (_, attrs, code) => {
        const attrStr = attrs || '';
        let style = '';
        let containerStyle = '';
        
        // Parse width attribute
        const widthMatch = attrStr.match(/width\s*=\s*(\d+%?)/);
        if (widthMatch) {
          style += `width: ${widthMatch[1]};`;
        }
        
        // Parse height attribute
        const heightMatch = attrStr.match(/height\s*=\s*(\d+%?)/);
        if (heightMatch) {
          style += `height: ${heightMatch[1]};`;
        }
        
        // Parse align attribute
        const alignMatch = attrStr.match(/align\s*=\s*(\w+)/);
        if (alignMatch) {
          const align = alignMatch[1];
          if (align === 'center') {
            containerStyle = 'display: flex; justify-content: center;';
          } else if (align === 'right') {
            containerStyle = 'display: flex; justify-content: flex-end;';
          }
        }
        
        const styleAttr = style ? ` style="${style}"` : '';
        const containerStyleAttr = containerStyle ? ` style="${containerStyle}"` : '';
        
        // Escape HTML in mermaid code
        const escapedCode = code.trim()
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        
        return `<div class="mermaid-container"${containerStyleAttr}><pre class="mermaid"${styleAttr}>${escapedCode}</pre></div>`;
      }
    );
  }
  
  private async renderMermaidDiagrams(): Promise<void> {
    const mermaidElements = this.preview.querySelectorAll('pre.mermaid');
    if (mermaidElements.length === 0) return;
    
    // Update mermaid theme based on current theme
    mermaid.initialize({
      startOnLoad: false,
      theme: this.settings.theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
    });
    
    for (let i = 0; i < mermaidElements.length; i++) {
      const el = mermaidElements[i] as HTMLElement;
      const code = el.textContent || '';
      const style = el.getAttribute('style') || '';
      
      try {
        const id = `mermaid-${Date.now()}-${i}`;
        const { svg } = await mermaid.render(id, code);
        
        // Create wrapper div with style
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-diagram';
        if (style) {
          wrapper.setAttribute('style', style);
        }
        wrapper.innerHTML = svg;
        
        el.replaceWith(wrapper);
      } catch (err) {
        console.error('Mermaid render error:', err);
        el.innerHTML = `<span style="color: red;">Mermaid Error: ${err}</span>`;
      }
    }
  }

  private processImageSize(content: string): string {
    // Convert ![alt](path){width=300} to <img src="path" alt="alt" width="300">
    // Supports: {width=N}, {height=N}, {width=N height=M}, {WxH}
    return content.replace(
      /!\[([^\]]*)\]\(([^)]+)\)\s*\{([^}]+)\}/g,
      (_, alt, src, attrs) => {
        let width = '';
        let height = '';
        
        // Parse {width=300 height=200} or {300x200} or {width=50%}
        const widthMatch = attrs.match(/width\s*=\s*(\d+%?)/);
        const heightMatch = attrs.match(/height\s*=\s*(\d+%?)/);
        const sizeMatch = attrs.trim().match(/^(\d+)x(\d+)$/);
        
        if (sizeMatch) {
          width = sizeMatch[1];
          height = sizeMatch[2];
        } else {
          if (widthMatch) width = widthMatch[1];
          if (heightMatch) height = heightMatch[1];
        }
        
        let imgTag = `<img src="${src}" alt="${alt}"`;
        if (width) imgTag += ` width="${width}"`;
        if (height) imgTag += ` height="${height}"`;
        imgTag += '>'; 
        
        return imgTag;
      }
    );
  }

  // ========== Math (KaTeX) ==========
  // Inline: $E = mc^2$ or \(E = mc^2\)
  // Block: $$...$$ or \[...\]
  
  private processMath(content: string): string {
    // Store math expressions to protect from markdown parsing
    const mathBlocks: string[] = [];
    
    // Process block math first: $$...$$ or \[...\]
    content = content.replace(
      /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g,
      (_, tex1, tex2) => {
        const tex = tex1 || tex2;
        const index = mathBlocks.length;
        try {
          const html = katex.renderToString(tex.trim(), {
            displayMode: true,
            throwOnError: false,
          });
          mathBlocks.push(`<div class="math-block">${html}</div>`);
        } catch (err) {
          mathBlocks.push(`<div class="math-block math-error">${tex}</div>`);
        }
        return `<!--MATH_BLOCK_${index}-->`;
      }
    );
    
    // Process inline math: $...$ or \(...\)
    // Be careful not to match $$ or currency like $100
    content = content.replace(
      /\$([^\$\n]+?)\$|\\\(([^)]+?)\\\)/g,
      (match, tex1, tex2) => {
        const tex = tex1 || tex2;
        // Skip if it looks like currency ($ followed by number)
        if (tex1 && /^\d/.test(tex1)) {
          return match;
        }
        const index = mathBlocks.length;
        try {
          const html = katex.renderToString(tex.trim(), {
            displayMode: false,
            throwOnError: false,
          });
          mathBlocks.push(`<span class="math-inline">${html}</span>`);
        } catch (err) {
          mathBlocks.push(`<span class="math-inline math-error">${tex}</span>`);
        }
        return `<!--MATH_INLINE_${index}-->`;
      }
    );
    
    // Store for later restoration
    (this as any)._mathBlocks = mathBlocks;
    
    return content;
  }

  // ========== Ruby (Furigana) - Aozora Bunko style ==========
  // ｜漢字《かんじ》 or |漢字《かんじ》
  
  private processRuby(content: string): string {
    // Pattern: ｜text《ruby》 or |text《ruby》
    // Also support: 漢字《かんじ》 (auto-detect kanji)
    
    // Explicit ruby with marker (｜ or |)
    content = content.replace(
      /[｜|]([^《]+)《([^》]+)》/g,
      '<ruby>$1<rt>$2</rt></ruby>'
    );
    
    // Auto ruby for kanji sequences followed by 《》
    // Matches continuous kanji characters
    content = content.replace(
      /([一-龯々]+)《([^》]+)》/g,
      '<ruby>$1<rt>$2</rt></ruby>'
    );
    
    return content;
  }

  private processFoldMarkers(content: string): string {
    // Convert <!-- fold: title --> ... <!-- /fold --> to details/summary
    return content.replace(
      /<!--\s*fold:\s*(.+?)\s*-->([\s\S]*?)<!--\s*\/fold\s*-->/g,
      (_, title, innerContent) => {
        return `<details class="manual-fold" open><summary>${title.trim()}</summary>\n\n${innerContent}\n\n</details>`;
      }
    );
  }

  private convertToFoldable(html: string): string {
    // Process headings into foldable sections using regex
    // Only H1-H3 are foldable
    
    // Find all headings and their positions (H1-H3 only)
    const headingRegex = /<(h[1-3])([^>]*)>([\s\S]*?)<\/\1>/g;
    const headings: Array<{
      fullMatch: string;
      tag: string;
      attrs: string;
      text: string;
      level: number;
      start: number;
      end: number;
    }> = [];
    
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
      headings.push({
        fullMatch: match[0],
        tag: match[1],
        attrs: match[2],
        text: match[3],
        level: parseInt(match[1][1]),
        start: match.index,
        end: match.index + match[0].length
      });
    }
    
    if (headings.length === 0) return html;
    
    // Build result by processing each heading and its content
    let result = '';
    let lastEnd = 0;
    
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      
      // Add content before this heading
      result += html.slice(lastEnd, heading.start);
      
      // Find where this section ends (next heading of same or higher level, or end)
      let sectionEnd = html.length;
      for (let j = i + 1; j < headings.length; j++) {
        if (headings[j].level <= heading.level) {
          sectionEnd = headings[j].start;
          break;
        }
      }
      
      // Get content between this heading and section end
      const contentStart = heading.end;
      const content = html.slice(contentStart, sectionEnd).trim();
      
      // Recursively process nested content
      const processedContent = content ? this.convertToFoldable(content) : '';
      
      // Create foldable section
      result += `<details open><summary><${heading.tag}${heading.attrs}>${heading.text}</${heading.tag}></summary>`;
      if (processedContent) {
        result += `<div class="fold-content">${processedContent}</div>`;
      }
      result += '</details>';
      
      // Skip the content we just processed (find next heading at same or higher level)
      lastEnd = sectionEnd;
      
      // Skip nested headings
      while (i + 1 < headings.length && headings[i + 1].start < sectionEnd) {
        i++;
      }
    }
    
    // Add any remaining content after the last section
    result += html.slice(lastEnd);
    
    return result;
  }

  private foldAll(): void {
    const details = this.preview.querySelectorAll('details');
    details.forEach(d => d.removeAttribute('open'));
  }

  private unfoldAll(): void {
    const details = this.preview.querySelectorAll('details');
    details.forEach(d => d.setAttribute('open', ''));
  }

  // ========== File Operations ==========

  async openFile(): Promise<void> {
    if (!tauriDialog || !tauriFs) {
      // Browser mode: prompt for URL
      const url = prompt('Enter URL to fetch markdown from:');
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        this.fetchMarkdownFromUrl(url);
      }
      return;
    }

    // Use current directory as default path if set
    const defaultPath = this.currentDirectory || undefined;

    const filePath = await tauriDialog.open({
      filters: [
        { name: 'mdvim', extensions: ['mdvim'] },
        { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      defaultPath
    });

    if (filePath && typeof filePath === 'string') {
      // Check if it's a URL (user might paste URL in file dialog)
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        await this.fetchMarkdownFromUrl(filePath);
        return;
      }
      
      // Check if it's a .mdvim file
      if (filePath.endsWith('.mdvim')) {
        await this.loadMdvim(filePath);
        this.currentDirectory = this.getDirectoryFromPath(filePath);
        return;
      }
      
      try {
        // Read as binary for encoding detection
        const binaryData = await tauriFs.readFile(filePath);
        const content = this.decodeWithAutoDetect(new Uint8Array(binaryData));
        
        this.editor.setValue(content);
        this.currentFilePath = filePath;
        this.currentDirectory = this.getDirectoryFromPath(filePath);
        this.fileName = filePath.split(/[/\\]/).pop() || 'Untitled';
        this.fileNameEl.textContent = this.fileName;
        this.modified = false;
        this.fileStatus.textContent = '';
        this.images.clear(); // Clear images when loading plain markdown
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    }
  }

  private decodeWithAutoDetect(data: Uint8Array): string {
    // Convert Uint8Array to number array for encoding-japanese
    const dataArray = Array.from(data);
    
    // Detect encoding using encoding-japanese
    const detected = Encoding.detect(dataArray);
    console.log('Detected encoding:', detected);
    
    // Try encoding-japanese conversion first
    try {
      if (detected === 'UTF8' || detected === 'ASCII') {
        return new TextDecoder('utf-8').decode(data);
      }
      
      if (detected === 'SJIS' || detected === 'EUCJP' || detected === 'JIS') {
        const unicodeArray = Encoding.convert(dataArray, {
          to: 'UNICODE',
          from: detected,
        });
        const result = Encoding.codeToString(unicodeArray);
        
        // Verify conversion worked (check for replacement characters)
        if (!result.includes('\uFFFD') && result.length > 0) {
          return result;
        }
      }
    } catch (e) {
      console.warn('encoding-japanese conversion failed:', e);
    }
    
    // Fallback: Try TextDecoder with various encodings
    const encodingsToTry = [
      'utf-8',
      'shift_jis',
      'euc-jp',
      'iso-2022-jp',
      'utf-16le',
      'utf-16be',
    ];
    
    for (const encoding of encodingsToTry) {
      try {
        const decoder = new TextDecoder(encoding, { fatal: true });
        const result = decoder.decode(data);
        console.log(`TextDecoder ${encoding} succeeded`);
        return result;
      } catch (e) {
        // Try next encoding
      }
    }
    
    // Last resort: UTF-8 with replacement characters
    console.warn('All decodings failed, using UTF-8 with replacements');
    return new TextDecoder('utf-8', { fatal: false }).decode(data);
  }

  async saveFile(): Promise<void> {
    if (this.currentFilePath) {
      if (this.currentFilePath.endsWith('.mdvim')) {
        await this.saveMdvim(this.currentFilePath);
      } else {
        await this.saveToPath(this.currentFilePath);
      }
    } else {
      await this.saveFileAs();
    }
  }

  async saveFileAs(): Promise<void> {
    if (!tauriDialog || !tauriFs) {
      console.log('File save not available in browser mode');
      return;
    }

    // Default to .mdvim if there are embedded images
    const hasImages = this.images.size > 0;
    const defaultExt = hasImages ? 'mdvim' : 'md';
    const baseName = this.fileName.replace(/\.(md|mdvim)$/, '');
    
    // Use current directory for default path
    const defaultPath = this.currentDirectory 
      ? `${this.currentDirectory}/${baseName}.${defaultExt}`
      : `${baseName}.${defaultExt}`;

    const filePath = await tauriDialog.save({
      filters: [
        { name: 'mdvim (with images)', extensions: ['mdvim'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      defaultPath
    });

    if (filePath) {
      if (filePath.endsWith('.mdvim')) {
        await this.saveMdvim(filePath);
      } else {
        await this.saveToPath(filePath);
      }
      // Update current directory after save
      this.currentDirectory = this.getDirectoryFromPath(filePath);
    }
  }

  private async saveToPath(filePath: string): Promise<void> {
    if (!tauriFs) return;

    try {
      await tauriFs.writeTextFile(filePath, this.editor.getValue());
      this.currentFilePath = filePath;
      this.currentDirectory = this.getDirectoryFromPath(filePath);
      this.fileName = filePath.split(/[/\\]/).pop() || 'Untitled';
      this.fileNameEl.textContent = this.fileName;
      this.modified = false;
      this.fileStatus.textContent = '(saved)';
      setTimeout(() => {
        if (!this.modified) this.fileStatus.textContent = '';
      }, 2000);
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }

  newFile(): void {
    if (this.modified) {
      // TODO: Add confirmation dialog
    }
    this.editor.setValue('');
    this.currentFilePath = null;
    this.fileName = 'Untitled';
    this.fileNameEl.textContent = this.fileName;
    this.modified = false;
    this.fileStatus.textContent = '';
    this.images.clear();
  }

  // ========== Image Management ==========

  private generateImageId(filename: string): string {
    // Generate short hash from timestamp + random
    const hash = Math.random().toString(36).substring(2, 10);
    const baseName = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = filename.match(/\.[^.]+$/)?.[0] || '.png';
    return `${baseName}_${hash}${ext}`;
  }

  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp',
    };
    return mimeTypes[ext || ''] || 'image/png';
  }

  private async addImage(file: File | Blob, originalName?: string): Promise<string> {
    const filename = originalName || `pasted_${Date.now()}.png`;
    const id = this.generateImageId(filename);
    const mimeType = this.getMimeType(filename);
    
    // Convert to Base64
    const data = await this.blobToBase64(file);
    
    const image: EmbeddedImage = {
      id,
      filename: id,
      mimeType,
      data,
    };
    
    this.images.set(id, image);
    return id;
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private insertImageMarkdown(imageId: string, altText: string = 'image'): void {
    // Format: ![filename](images/filename)
    const markdown = `![${imageId}](images/${imageId})`;
    
    // Insert at current cursor position
    const position = this.editor.getPosition();
    if (position) {
      this.editor.executeEdits('insert-image', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: markdown,
      }]);
    }
    
    this.modified = true;
    this.fileStatus.textContent = '(modified)';
  }

  private async handlePaste(e: ClipboardEvent): Promise<void> {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const id = await this.addImage(file, `pasted_${Date.now()}.png`);
          this.insertImageMarkdown(id);
          this.updatePreview();
        }
        return;
      }
    }
  }

  private async handleDrop(e: DragEvent): Promise<void> {
    console.log('handleDrop called');
    const files = e.dataTransfer?.files;
    console.log('Dropped files:', files);
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const ext = file.name.toLowerCase().split('.').pop() || '';
      console.log('Processing dropped file:', file.name, 'type:', file.type, 'ext:', ext);
      
      // Handle image files (by type or extension)
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
      if (file.type.startsWith('image/') || imageExts.includes(ext)) {
        const id = await this.addImage(file, file.name);
        console.log('Image added with id:', id);
        this.insertImageMarkdown(id, file.name.replace(/\.[^.]+$/, ''));
        continue;
      }
      
      // Handle markdown/text files - open them
      if (ext === 'md' || ext === 'markdown' || ext === 'txt' || ext === 'mdvim') {
        console.log('Opening file:', file.name);
        
        // Confirm if modified
        if (this.modified) {
          const confirmed = confirm('現在の変更を破棄してファイルを開きますか？');
          if (!confirmed) continue;
        }
        
        try {
          if (ext === 'mdvim') {
            // Handle .mdvim file
            console.log('Loading .mdvim file');
            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);
            
            const contentFile = zip.file('content.md');
            if (contentFile) {
              const markdown = await contentFile.async('string');
              this.editor.setValue(markdown);
            }
            
            // Load images
            this.images.clear();
            const imagesFolder = zip.folder('images');
            if (imagesFolder) {
              const imageFiles = imagesFolder.filter(() => true);
              for (const imgFile of imageFiles) {
                if (imgFile.dir) continue;
                const data = await imgFile.async('base64');
                const filename = imgFile.name.replace('images/', '');
                const image: EmbeddedImage = {
                  id: filename,
                  filename,
                  mimeType: this.getMimeType(filename),
                  data,
                };
                this.images.set(filename, image);
              }
            }
          } else {
            // Handle plain text/markdown file
            console.log('Loading text file');
            const text = await file.text();
            this.editor.setValue(text);
            this.images.clear();
          }
          
          this.currentFilePath = null; // Browser mode, no path
          this.fileName = file.name;
          this.fileNameEl.textContent = this.fileName;
          this.modified = false;
          this.fileStatus.textContent = '';
          console.log('File loaded successfully:', file.name);
        } catch (err) {
          console.error('Failed to load file:', err);
          this.fileStatus.textContent = '(load failed)';
        }
        break; // Only open first file
      }
    }
    this.updatePreview();
  }

  private async selectAndInsertImage(): Promise<void> {
    console.log('selectAndInsertImage called');
    
    // Try Tauri file dialog first
    if (tauriDialog) {
      try {
        const selected = await tauriDialog.open({
          multiple: true,
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
        });
        
        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected];
          for (const filePath of paths) {
            if (tauriFs) {
              const data = await tauriFs.readFile(filePath);
              const blob = new Blob([new Uint8Array(data)]);
              const fileName = filePath.split(/[/\\]/).pop() || 'image.png';
              const id = await this.addImage(blob, fileName);
              this.insertImageMarkdown(id, fileName.replace(/\.[^.]+$/, ''));
            }
          }
          this.updatePreview();
        }
        return;
      } catch (err) {
        console.log('Tauri dialog failed, falling back to HTML input:', err);
      }
    }
    
    // Fallback to HTML file input for browser
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.position = 'fixed';
    input.style.top = '-1000px';
    input.style.left = '-1000px';
    document.body.appendChild(input);
    
    input.onchange = async () => {
      console.log('File input changed, files:', input.files);
      const files = input.files;
      if (!files || files.length === 0) {
        document.body.removeChild(input);
        return;
      }
      
      for (const file of Array.from(files)) {
        console.log('Processing file:', file.name);
        const id = await this.addImage(file, file.name);
        console.log('Image added with id:', id);
        this.insertImageMarkdown(id, file.name.replace(/\.[^.]+$/, ''));
      }
      this.updatePreview();
      document.body.removeChild(input);
    };
    
    // Use setTimeout to ensure the element is in the DOM
    setTimeout(() => input.click(), 100);
  }

  // ========== .mdvim File Format ==========

  private async saveMdvim(filePath: string): Promise<void> {
    const zip = new JSZip();
    
    // Clean up unused images before saving
    this.cleanupUnusedImages();
    
    // Add markdown content
    zip.file('content.md', this.editor.getValue());
    
    // Add images
    const imagesFolder = zip.folder('images');
    if (imagesFolder) {
      for (const [id, image] of this.images) {
        imagesFolder.file(image.filename, image.data, { base64: true });
      }
    }
    
    // Add metadata
    const meta = {
      version: '1.0',
      created: new Date().toISOString(),
      imageCount: this.images.size,
    };
    zip.file('meta.json', JSON.stringify(meta, null, 2));
    
    // Generate ZIP
    const content = await zip.generateAsync({ type: 'uint8array' });
    
    // Save via Tauri
    if (tauriFs) {
      await tauriFs.writeFile(filePath, content);
      this.currentFilePath = filePath;
      this.fileName = filePath.split(/[/\\]/).pop() || 'Untitled';
      this.fileNameEl.textContent = this.fileName;
      this.modified = false;
      this.fileStatus.textContent = '(saved)';
      setTimeout(() => {
        if (!this.modified) this.fileStatus.textContent = '';
      }, 2000);
    }
  }

  private async loadMdvim(filePath: string): Promise<void> {
    if (!tauriFs) return;
    
    try {
      const content = await tauriFs.readFile(filePath);
      const zip = await JSZip.loadAsync(content);
      
      // Load markdown content
      const contentFile = zip.file('content.md');
      if (contentFile) {
        const markdown = await contentFile.async('string');
        this.editor.setValue(markdown);
      }
      
      // Load images
      this.images.clear();
      const imagesFolder = zip.folder('images');
      if (imagesFolder) {
        const imageFiles = imagesFolder.filter(() => true);
        for (const file of imageFiles) {
          if (file.dir) continue;
          const data = await file.async('base64');
          const filename = file.name.replace('images/', '');
          const image: EmbeddedImage = {
            id: filename,
            filename,
            mimeType: this.getMimeType(filename),
            data,
          };
          this.images.set(filename, image);
        }
      }
      
      this.currentFilePath = filePath;
      this.fileName = filePath.split(/[/\\]/).pop() || 'Untitled';
      this.fileNameEl.textContent = this.fileName;
      this.modified = false;
      this.fileStatus.textContent = '';
      this.updatePreview();
    } catch (err) {
      console.error('Failed to load .mdvim file:', err);
      this.fileStatus.textContent = '(load failed)';
    }
  }

  private getImageDataUrl(imageId: string): string | null {
    const image = this.images.get(imageId);
    if (!image) return null;
    return `data:${image.mimeType};base64,${image.data}`;
  }

  private cleanupUnusedImages(): void {
    const content = this.editor.getValue();
    const usedImages = new Set<string>();
    
    // Find all image references in markdown
    // Pattern: ![...](images/filename) or ![...](filename)
    const regex = /!\[[^\]]*\]\((?:images\/)?([^)]+)\)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      usedImages.add(match[1]);
    }
    
    // Remove unused images
    const toRemove: string[] = [];
    for (const [id, _image] of this.images) {
      if (!usedImages.has(id)) {
        toRemove.push(id);
      }
    }
    
    for (const id of toRemove) {
      this.images.delete(id);
      console.log('Removed unused image:', id);
    }
    
    if (toRemove.length > 0) {
      console.log(`Cleaned up ${toRemove.length} unused image(s)`);
    }
  }

  // ========== Public API ==========

  public getValue(): string {
    return this.editor.getValue();
  }

  public setValue(content: string): void {
    this.editor.setValue(content);
    this.modified = false;
    this.fileStatus.textContent = '';
  }

  public setFileName(name: string): void {
    this.fileName = name;
    this.fileNameEl.textContent = name;
  }

  public isModified(): boolean {
    return this.modified;
  }

  public focus(): void {
    this.editor.focus();
  }

  public getSettings(): Settings {
    return { ...this.settings };
  }
}

// ========== Initialize ==========

const app = new MdVimApp();

// Expose to window for Tauri and debugging
(window as any).mdvim = app;
