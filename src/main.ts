/**
 * @fileoverview mdvim-monaco - A Markdown editor with Vim keybindings
 * Built on Monaco Editor and Tauri for desktop application support.
 * Supports single-file editing and multi-file project management with mdebook compatibility.
 * 
 * @author fukuyori
 * @version 1.0.0
 */

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

/**
 * Defines custom Monaco editor themes with heading colors
 * @description Creates 'mdvim-dark' and 'mdvim-light' themes with custom heading colors
 */
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

/** Available color themes for the editor */
type Theme = 'dark' | 'light' | 'monokai' | 'solarized-dark' | 'solarized-light' | 'nord' | 'dracula' | 'github-dark' | 'github-light';

/** View modes for the editor layout */
type ViewMode = 'editor' | 'split' | 'preview';

/** Maps application themes to Monaco editor themes */
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

/**
 * Editor settings configuration
 * @interface Settings
 */
interface Settings {
  /** Current color theme */
  theme: Theme;
  /** Editor font size in pixels */
  fontSize: number;
  /** Whether Vim mode is enabled */
  vimEnabled: boolean;
  /** Whether text wrapping is enabled */
  wrap: boolean;
  /** Tab size in spaces */
  tabSize: number;
  /** Current view mode (editor/split/preview) */
  viewMode: ViewMode;
  /** Whether auto-save is enabled */
  autoSave: boolean;
  /** Auto-save interval in seconds */
  autoSaveInterval: number;
}

/**
 * Embedded image data for storage in project files
 * @interface EmbeddedImage
 */
interface EmbeddedImage {
  /** Unique identifier for the image */
  id: string;
  /** Original filename */
  filename: string;
  /** MIME type (e.g., 'image/png') */
  mimeType: string;
  /** Base64 encoded image data */
  data: string;
}

// ========== Export Types ==========

/** Export format options */
type ExportFormat = 'md' | 'md-inline' | 'md-merged' | 'html' | 'html-multi' | 'pdf' | 'epub' | 'mdbook';

/** Export scope: current page or all pages */
type ExportScope = 'current' | 'all';

/**
 * Export configuration options
 * @interface ExportOptions
 */
interface ExportOptions {
  /** Export scope: current page or all pages */
  scope: ExportScope;
  /** Export format */
  format: ExportFormat;
  /** Whether to include images */
  includeImages: boolean;
  /** Whether to include table of contents */
  includeToc: boolean;
  /** Whether to number headings */
  numberHeadings: boolean;
  /** Output path (optional) */
  outputPath?: string;
}

// ========== Project Types (Phase 1) ==========

/** Position of UI panels */
type PanelPosition = 'left' | 'right' | 'hidden';

/**
 * Layout configuration for UI panels
 * @interface LayoutSettings
 */
interface LayoutSettings {
  /** Panel positions */
  panels: {
    tabs: PanelPosition;
    explorer: PanelPosition;
    toc: PanelPosition;
    preview: PanelPosition;
  };
  /** Panel visibility states */
  visibility: {
    tabs: boolean;
    explorer: boolean;
    toc: boolean;
    preview: boolean;
  };
  /** Panel sizes in pixels */
  sizes: {
    leftPanel: number;
    rightPanel: number;
    tabsWidth: number;
  };
}

/**
 * Project metadata stored in manifest.json
 * @interface ProjectMetadata
 */
interface ProjectMetadata {
  /** Project title */
  title: string;
  /** Author name (optional) */
  author?: string;
  /** Project description (optional) */
  description?: string;
  /** Content language code (optional) */
  language?: string;
}

/**
 * File entry in project manifest
 * @interface ProjectFileEntry
 */
interface ProjectFileEntry {
  /** Unique file identifier */
  id: string;
  /** File path within the project */
  path: string;
  /** Display name (without extension) */
  name: string;
  /** Sort order in file list */
  order: number;
}

/**
 * Project manifest structure (stored as manifest.json in .mdvim/.mdebook files)
 * @interface ProjectManifest
 */
interface ProjectManifest {
  /** Manifest format version */
  version: string;
  /** Project format type */
  format: 'mdvim' | 'mdebook';
  /** Creation timestamp (ISO format) */
  created: string;
  /** Last modification timestamp (ISO format) */
  modified: string;
  /** Project metadata */
  metadata: ProjectMetadata;
  /** List of files in the project */
  files: ProjectFileEntry[];
  /** Currently active file ID */
  activeFileId: string;
  /** Saved editor settings (optional) */
  settings?: Partial<Settings>;
  /** Saved layout settings (optional) */
  layout?: Partial<LayoutSettings>;
}

/**
 * Project configuration (not currently used, reserved for future)
 * @interface ProjectConfig
 */
interface ProjectConfig {
  /** Folder for image attachments */
  attachmentFolder: string;
  /** Default location for new files */
  defaultNewFileLocation: string;
  /** Recently opened files */
  recentFiles: string[];
  /** Favorited files */
  favorites: string[];
  /** Expanded folder IDs in tree view */
  expandedFolders: string[];
}

/**
 * In-memory representation of an editor file
 * @interface EditorFile
 */
interface EditorFile {
  /** Unique file identifier */
  id: string;
  /** File path (filename with extension) */
  path: string;
  /** Display name (without extension) */
  name: string;
  /** File content */
  content: string;
  /** Whether the file has unsaved changes */
  modified: boolean;
  /** Sort order in file list (optional) */
  order?: number;
  /** Saved cursor position (optional) */
  cursorPosition?: { line: number; column: number };
  /** Saved scroll position (optional) */
  scrollTop?: number;
}

/**
 * Node in the file tree structure
 * @interface FileTreeNode
 */
interface FileTreeNode {
  /** Node identifier (file ID or folder path) */
  id: string;
  /** Display name */
  name: string;
  /** File/folder path */
  path: string;
  /** Node type */
  type: 'file' | 'folder';
  /** Child nodes (for folders) */
  children?: FileTreeNode[];
  /** Whether folder is expanded in tree view */
  expanded?: boolean;
}

/**
 * Current project state
 * @interface ProjectState
 */
interface ProjectState {
  /** Whether a project is currently open */
  isProject: boolean;
  /** Path to the project file (.mdvim/.mdebook) */
  projectPath: string | null;
  /** Project manifest data */
  manifest: ProjectManifest | null;
  /** Map of file ID to EditorFile */
  files: Map<string, EditorFile>;
  /** File tree for explorer */
  fileTree: FileTreeNode[];
  /** Currently active file ID */
  activeFileId: string | null;
  /** List of open tab file IDs */
  openTabs: string[];
  /** Set of modified file IDs */
  modifiedFiles: Set<string>;
  /** Navigation history (file IDs) */
  history: string[];
  /** Current position in navigation history */
  historyIndex: number;
}

/** File format detection result */
type FileFormat = 'single-markdown' | 'mdvim-v1' | 'mdvim-v2' | 'mdebook' | 'folder';

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

/**
 * Main application class for mdvim-monaco editor
 * 
 * @class MdVimApp
 * @description Manages the entire Markdown editor application including:
 * - Monaco editor with Vim keybindings
 * - Live preview with Mermaid and KaTeX support
 * - Single file and multi-file project management
 * - File I/O (Tauri desktop and browser)
 * - Theme and settings management
 * - Explorer panel with drag-and-drop reordering
 * 
 * @example
 * // Application is initialized automatically on DOM load
 * // See bottom of file for initialization
 */
class MdVimApp {
  /** Monaco editor instance */
  private editor: monaco.editor.IStandaloneCodeEditor;
  /** Vim mode controller (null if Vim mode is disabled) */
  private vimMode: VimMode | null = null;
  
  // ========== Settings ==========
  
  /** Current editor settings */
  private settings: Settings = {
    theme: 'dark',
    fontSize: 100,
    vimEnabled: true,
    wrap: true,
    tabSize: 2,
    viewMode: 'split',
    autoSave: false,
    autoSaveInterval: 30,
  };
  
  // ========== State ==========
  
  /** Whether current file has unsaved changes */
  private modified = false;
  /** Current file name (display name) */
  private fileName = 'Untitled';
  /** Full path to current file (null for new files) */
  private currentFilePath: string | null = null;
  /** Current working directory */
  private currentDirectory: string | null = null;
  /** Whether IME composition is in progress */
  private isComposing = false;
  /** Auto-save timer handle */
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  /** Last saved content for change detection */
  private lastSavedContent = '';
  /** Currently dragged file ID for reordering */
  private draggingFileId: string | null = null;
  
  // ========== Project State ==========
  
  /** Current project state (multi-file mode) */
  private projectState: ProjectState = {
    isProject: false,
    projectPath: null,
    manifest: null,
    files: new Map(),
    fileTree: [],
    activeFileId: null,
    openTabs: [],
    modifiedFiles: new Set(),
    history: [],
    historyIndex: -1,
  };
  
  // ========== Layout Settings ==========
  
  /** UI panel layout configuration */
  private layoutSettings: LayoutSettings = {
    panels: {
      tabs: 'left',
      explorer: 'left',
      toc: 'right',
      preview: 'right',
    },
    visibility: {
      tabs: false,      // プロジェクト時のみ表示
      explorer: false,  // プロジェクト時のみ表示
      toc: true,
      preview: true,
    },
    sizes: {
      leftPanel: 200,
      rightPanel: 300,
      tabsWidth: 40,
    },
  };
  
  // ========== Image Management ==========
  
  /** Map of embedded images (ID -> EmbeddedImage) */
  private images: Map<string, EmbeddedImage> = new Map();

  // ========== DOM Elements ==========
  
  /** Container element for Monaco editor */
  private editorContainer: HTMLElement;
  /** Preview pane element */
  private preview: HTMLElement;
  /** Vim status bar element */
  private vimStatusbar: HTMLElement;
  /** Cursor position display element */
  private cursorPos: HTMLElement;
  /** Document statistics display element */
  private statsInfo: HTMLElement;
  /** File name display element */
  private fileNameEl: HTMLElement;
  /** File status display element (modified, saved, etc.) */
  private fileStatus: HTMLElement;
  /** Font size display element */
  private fontSizeDisplay: HTMLElement;
  /** Vim mode toggle button */
  private vimToggleBtn: HTMLElement;
  /** Theme selector dropdown */
  private themeSelector: HTMLSelectElement;
  /** Table of Contents pane element */
  private tocPane: HTMLElement;
  /** Table of Contents content element */
  private tocContent: HTMLElement;
  
  // ========== Progress Modal ==========
  
  /** Progress modal element */
  private progressModal: HTMLElement | null = null;
  /** Progress bar element */
  private progressBar: HTMLElement | null = null;
  /** Progress text element */
  private progressText: HTMLElement | null = null;
  /** Progress detail element */
  private progressDetail: HTMLElement | null = null;
  /** Progress title element */
  private progressTitle: HTMLElement | null = null;

  // ========== New File Modal ==========
  
  /** New file modal element */
  private newFileModal: HTMLElement | null = null;
  /** New file name input element */
  private newFileNameInput: HTMLInputElement | null = null;
  /** Callback for new file creation */
  private newFileCallback: ((fileName: string, content: string) => void) | null = null;

  /**
   * Creates a new MdVimApp instance
   * Initializes Monaco editor, Vim mode, event handlers, and Tauri APIs
   */
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
    
    // Add Ctrl+` keybind to Monaco editor (for Vim toggle)
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backquote, () => {
      this.toggleVimMode();
    });

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
    
    // Focus editor on startup
    setTimeout(() => {
      this.editor.focus();
    }, 100);
    
    console.log('MdVimApp initialized');
  }

  /**
   * Sets up Tauri file drop event handler
   * Handles drag-and-drop of files into the application window
   * Supports images (embed) and markdown/text files (open)
   * @private
   */
  private async setupTauriFileDrop(): Promise<void> {
    if (!tauriEvent || !tauriFs) return;
    
    try {
      // Listen for drag enter/leave for visual feedback
      await tauriEvent.listen('tauri://drag-enter', () => {
        this.editorContainer.classList.add('drag-over');
      });
      
      await tauriEvent.listen('tauri://drag-leave', () => {
        this.editorContainer.classList.remove('drag-over');
      });
      
      // Tauri v2 uses 'tauri://drag-drop' instead of 'tauri://file-drop'
      await tauriEvent.listen('tauri://drag-drop', async (event: any) => {
        this.editorContainer.classList.remove('drag-over');
        
        const payload = event.payload;
        
        // Tauri v2 payload structure: { type: 'drop', paths: [...] } or { paths: [...] }
        let paths: string[] = [];
        if (payload && payload.paths) {
          paths = payload.paths;
        } else if (Array.isArray(payload)) {
          paths = payload;
        } else {
          return;
        }
        
        if (paths.length === 0) {
          return;
        }
        
        for (const filePath of paths) {
          const ext = filePath.toLowerCase().split('.').pop() || '';
          const fileName = filePath.split(/[/\\]/).pop() || 'file';
          
          // Check if it's an image
          const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
          
          if (imageExts.includes(ext)) {
            try {
              const data = await tauriFs!.readFile(filePath);
              const blob = new Blob([new Uint8Array(data)]);
              const id = await this.addImage(blob, fileName);
              this.insertImageMarkdown(id, fileName.replace(/\.[^.]+$/, ''));
            } catch (err) {
              console.error('Failed to read dropped image:', err);
            }
            continue;
          }
          
          // Check if it's a markdown file - ALWAYS ADD (never replace)
          if (ext === 'md' || ext === 'markdown') {
            
            // If not in project mode, convert to project first
            if (!this.projectState.isProject) {
              this.convertToProject();
            }
            
            // Add to project
            try {
              const binaryData = await tauriFs!.readFile(filePath);
              const content = this.decodeWithAutoDetect(new Uint8Array(binaryData));
              await this.addMarkdownContentToProject(content, fileName);
            } catch (err) {
              console.error('Failed to add file to project:', err);
              this.fileStatus.textContent = '(add failed)';
            }
            continue;
          }
          
          // Check if it's a mdvim/mdebook project file - ALWAYS REPLACE
          if (ext === 'mdvim' || ext === 'mdebook') {
            
            const hasUnsavedChanges = this.modified || (this.projectState.isProject && this.projectState.modifiedFiles.size > 0);
            
            if (hasUnsavedChanges) {
              const result = await this.confirmSaveBeforeAction('プロジェクトを開く前に現在の変更を保存しますか？');
              if (result === 'cancel') continue;
              if (result === 'save') {
                await this.saveFile();
              }
            }
            
            try {
              await this.loadMdvim(filePath);
            } catch (err) {
              console.error('Failed to load project:', err);
              this.fileStatus.textContent = '(load failed)';
            }
            break;
          }
          
          // Check if it's a plain text file - treat as markdown, ALWAYS ADD
          if (ext === 'txt') {
            
            // If not in project mode, convert to project first
            if (!this.projectState.isProject) {
              this.convertToProject();
            }
            
            // Add to project (with .md extension)
            try {
              const binaryData = await tauriFs!.readFile(filePath);
              const content = this.decodeWithAutoDetect(new Uint8Array(binaryData));
              const mdFileName = fileName.replace(/\.txt$/, '.md');
              await this.addMarkdownContentToProject(content, mdFileName);
            } catch (err) {
              console.error('Failed to add file to project:', err);
              this.fileStatus.textContent = '(add failed)';
            }
            continue;
          }
        }
        this.updatePreview();
      });
      console.log('Tauri drag-drop listener registered');
    } catch (err) {
      console.log('Failed to setup Tauri drag-drop:', err);
    }
  }
  
  /**
   * Adds markdown content to the current project
   * @param content - Markdown content
   * @param fileName - File name
   * @private
   */
  private async addMarkdownContentToProject(content: string, fileName: string): Promise<void> {
    if (!this.projectState.isProject) return;
    
    const id = this.generateUUID();
    const name = fileName.replace(/\.md$/, '').replace(/\.markdown$/, '');
    
    // Get max order
    const maxOrder = Math.max(0, ...Array.from(this.projectState.files.values()).map(f => f.order ?? 0));
    
    const newFile: EditorFile = {
      id,
      path: fileName.endsWith('.md') ? fileName : fileName + '.md',
      name,
      content,
      modified: true,
      order: maxOrder + 1,
    };
    
    this.projectState.files.set(id, newFile);
    this.projectState.modifiedFiles.add(id);
    
    if (this.projectState.manifest) {
      this.projectState.manifest.files.push({
        id,
        path: newFile.path,
        name,
        order: maxOrder + 1,
      });
    }
    
    this.buildFileTree();
    this.openFileInProject(id);
    this.updateProjectUI();
    
    this.fileStatus.textContent = `(imported: ${fileName})`;
    setTimeout(() => {
      this.fileStatus.textContent = this.projectState.modifiedFiles.size > 0 ? '(modified)' : '';
    }, 2000);
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

  /**
   * Loads settings from localStorage
   * Falls back to default settings if none found
   * @private
   */
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

  /**
   * Saves current settings to localStorage
   * @private
   */
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

  /**
   * Performs auto-save to localStorage (backup) and optionally to file
   * @private
   */
  private performAutoSave(): void {
    const currentContent = this.editor.getValue();
    
    // Only save if content has changed
    if (currentContent === this.lastSavedContent) {
      return;
    }

    // For project mode with existing path, save to file
    if (this.projectState.isProject && this.projectState.projectPath && tauriFs) {
      // Update current file content
      if (this.projectState.activeFileId) {
        const currentFile = this.projectState.files.get(this.projectState.activeFileId);
        if (currentFile) {
          currentFile.content = currentContent;
        }
      }
      
      // Save project asynchronously
      this.saveProject().then(() => {
        this.lastSavedContent = currentContent;
      }).catch(err => {
        console.error('Auto-save to file failed:', err);
      });
      return;
    }
    
    // For single file mode with existing path, save to file
    if (!this.projectState.isProject && this.currentFilePath && tauriFs) {
      this.saveFile().then(() => {
        this.lastSavedContent = currentContent;
      }).catch(err => {
        console.error('Auto-save to file failed:', err);
      });
      return;
    }

    // Fallback: Save to localStorage as backup
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
      this.fileStatus.textContent = '(auto-saved to backup)';
      setTimeout(() => {
        if (this.fileStatus.textContent === '(auto-saved to backup)') {
          this.fileStatus.textContent = this.modified ? '(modified)' : originalStatus || '';
        }
      }, 1500);
      
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

  /**
   * Registers custom Vim Ex commands
   * Includes :w, :e, :q, :cd, :rename, :bd, :Ex, and more
   * @private
   */
  private registerVimCommands(): void {
    // Access Vim's command-line mode API via VimMode.Vim
    const Vim = VimMode.Vim;
    if (!Vim) {
      console.warn('VimMode.Vim not available for custom commands');
      return;
    }

    // Setup system clipboard support for "* and "+ registers
    // Using key mappings since defineRegister may not be available
    const VimAny = Vim as any;
    
    // Try defineRegister first (if available)
    if (typeof VimAny.defineRegister === 'function') {
      const clipboardRegister = {
        _cachedText: '',
        setText: function(text: string) {
          this._cachedText = text;
          navigator.clipboard.writeText(text).catch(err => {
            console.error('Failed to write to clipboard:', err);
          });
        },
        getText: function(): string {
          return this._cachedText;
        },
        pushText: function(text: string, linewise?: boolean) {
          if (linewise && !text.endsWith('\n')) {
            text += '\n';
          }
          this.setText(text);
        }
      };
      VimAny.defineRegister('*', clipboardRegister);
      VimAny.defineRegister('+', clipboardRegister);
      this.syncClipboardToCache(clipboardRegister);
    }
    
    // Setup key mappings for clipboard operations
    // These work regardless of defineRegister availability
    this.setupClipboardMappings();

    // :w - Save file
    // :w - Save (project or single file)
    Vim.defineEx('write', 'w', async (_cm: any, params: any) => {
      if (params.args && params.args.length > 0) {
        // :w filename - save as
        this.saveFileWithName(params.args[0]);
      } else if (this.projectState.isProject) {
        // Project mode: save project
        await this.saveProject();
      } else {
        // Single file mode: save file
        this.saveFile();
      }
    });

    // :q - Quit (close project or exit app)
    Vim.defineEx('quit', 'q', (_cm: any, params: any) => {
      const force = params.argString?.includes('!');
      if (this.projectState.isProject) {
        // Project mode: close project
        this.closeProject();
      } else {
        // Single file mode: exit app
        this.quit(force);
      }
    });

    // :wq - Save and quit
    Vim.defineEx('wq', 'wq', async () => {
      if (this.projectState.isProject) {
        await this.saveProject();
        this.closeProject();
      } else {
        await this.saveFile();
        this.quit(true);
      }
    });

    // :x - Save if modified and quit
    Vim.defineEx('xit', 'x', async () => {
      if (this.projectState.isProject) {
        if (this.projectState.modifiedFiles.size > 0) {
          await this.saveProject();
        }
        this.closeProject();
      } else {
        if (this.modified) {
          await this.saveFile();
        }
        this.quit(true);
      }
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

    // :new - New project or new file in project
    Vim.defineEx('new', 'new', (_cm: any, params: any) => {
      if (this.projectState.isProject) {
        // Project mode: create new file in project
        const fileName = params.args?.[0] || 'untitled.md';
        this.createNewFileInProject(fileName);
      } else {
        // Single file mode: create new project
        const projectName = params.args?.[0];
        this.createNewProject(projectName);
      }
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

    // :exit - Force exit application
    Vim.defineEx('exit', 'exi', () => {
      this.quit(true);
    });

    // :qa - Quit all (force exit regardless of project mode)
    Vim.defineEx('qall', 'qa', (_cm: any, params: any) => {
      const force = params.argString?.includes('!');
      if (this.projectState.isProject && !force) {
        this.fileStatus.textContent = '(project has unsaved changes - use :qa! to force)';
        return;
      }
      this.quit(true);
    });

    // :toc - Toggle Table of Contents
    Vim.defineEx('toc', 'toc', () => {
      this.toggleToc();
    });
    
    // :grep / :search - Search in project
    Vim.defineEx('grep', 'gr', (_cm: any, params: any) => {
      if (!this.projectState.isProject) {
        this.fileStatus.textContent = '(grep: not in project mode)';
        return;
      }
      this.toggleSearchPanel();
      if (params.argString) {
        const input = document.getElementById('search-input') as HTMLInputElement;
        if (input) {
          input.value = params.argString.trim();
          this.searchInProject(params.argString.trim());
        }
      }
    });
    
    Vim.defineEx('search', 'sea', (_cm: any, params: any) => {
      if (!this.projectState.isProject) {
        this.fileStatus.textContent = '(search: not in project mode)';
        return;
      }
      this.toggleSearchPanel();
      if (params.argString) {
        const input = document.getElementById('search-input') as HTMLInputElement;
        if (input) {
          input.value = params.argString.trim();
          this.searchInProject(params.argString.trim());
        }
      }
    });

    // :exp / :export - Export dialog or direct export
    Vim.defineEx('exp', 'exp', (_cm: any, params: any) => {
      if (params.argString && params.argString.trim()) {
        this.handleExportCommand(params.argString.trim());
      } else {
        this.showExportDialog();
      }
    });
    
    Vim.defineEx('export', 'export', (_cm: any, params: any) => {
      if (params.argString && params.argString.trim()) {
        this.handleExportCommand(params.argString.trim());
      } else {
        this.showExportDialog();
      }
    });

    // :pdf - Export to PDF
    // :image - Insert image
    Vim.defineEx('image', 'ima', () => {
      this.selectAndInsertImage();
    });
    
    // :imp / :import - Import markdown file, mdvim project, or URL
    Vim.defineEx('import', 'imp', (_cm: any, params: any) => {
      if (params.argString && params.argString.trim()) {
        this.importFromPath(params.argString.trim());
      } else {
        this.showImportDialog();
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

    // :project - Project management
    Vim.defineEx('project', 'proj', async (_cm: any, params: any) => {
      const subCmd = params.args?.[0];
      switch (subCmd) {
        case 'new':
          this.createNewProject(params.args?.[1]);
          break;
        case 'open':
          this.openProjectDialog();
          break;
        case 'save':
          await this.saveProject();
          break;
        case 'close':
          this.closeProject();
          break;
        default:
          this.showProjectStatus();
      }
    });

    // :vnew - New file in project
    Vim.defineEx('vnew', 'vnew', (_cm: any, params: any) => {
      const fileName = params.args?.[0] || 'untitled.md';
      this.createNewFileInProject(fileName);
    });

    // :vpaste - Create new file from clipboard content
    Vim.defineEx('vpaste', 'vp', async (_cm: any, params: any) => {
      const fileName = params.args?.[0] || 'untitled.md';
      try {
        const content = await navigator.clipboard.readText();
        if (!content) {
          this.fileStatus.textContent = '(clipboard is empty)';
          return;
        }
        this.createNewFileInProject(fileName, content);
        this.fileStatus.textContent = '(created from clipboard)';
        setTimeout(() => {
          if (this.fileStatus.textContent === '(created from clipboard)') {
            this.fileStatus.textContent = this.modified ? '(modified)' : '';
          }
        }, 2000);
      } catch (err) {
        console.error('Failed to read clipboard:', err);
        this.fileStatus.textContent = '(clipboard error)';
      }
    });

    // :bn / :bnext - Next buffer
    Vim.defineEx('bnext', 'bn', () => {
      this.nextBuffer();
    });

    // :bp / :bprev - Previous buffer
    Vim.defineEx('bprev', 'bp', () => {
      this.prevBuffer();
    });

    // :b - Switch to buffer
    Vim.defineEx('buffer', 'b', (_cm: any, params: any) => {
      const target = params.args?.[0];
      if (target) {
        this.switchToBuffer(target);
      } else {
        this.showBufferList();
      }
    });

    // :ls / :buffers - List buffers
    Vim.defineEx('ls', 'ls', () => {
      this.showBufferList();
    });
    Vim.defineEx('buffers', 'buffers', () => {
      this.showBufferList();
    });

    // :bd / :bdelete - Close buffer, :bd! to delete file
    Vim.defineEx('bdelete', 'bd', (_cm: any, params: any) => {
      const forceDelete = params.argString?.includes('!');
      const target = params.args?.[0];
      
      if (forceDelete) {
        // Delete file from project
        if (target) {
          const fileId = this.findFileIdByName(target);
          if (fileId) {
            this.deleteFileFromProject(fileId);
          } else {
            this.fileStatus.textContent = `(file not found: ${target})`;
          }
        } else if (this.projectState.activeFileId) {
          this.deleteFileFromProject(this.projectState.activeFileId);
        }
      } else {
        // Just close the buffer (tab)
        if (target) {
          this.closeBuffer(target);
        } else if (this.projectState.activeFileId) {
          this.closeFileInProject(this.projectState.activeFileId);
        }
      }
    });

    // :rename - Rename current file
    Vim.defineEx('rename', 'ren', (_cm: any, params: any) => {
      const newName = params.args?.join(' ')?.trim();
      if (!newName) {
        this.fileStatus.textContent = '(usage: :rename <new name>)';
        return;
      }
      if (this.projectState.isProject && this.projectState.activeFileId) {
        this.renameFileInProject(this.projectState.activeFileId, newName);
      } else {
        // Single file mode - just change display name
        this.fileName = newName.endsWith('.md') ? newName : `${newName}.md`;
        this.fileNameEl.textContent = this.fileName;
        this.modified = true;
        this.fileStatus.textContent = '(renamed)';
      }
    });

    // :explorer - Toggle explorer (shortcut :ex)
    Vim.defineEx('explorer', 'ex', () => {
      this.toggleExplorer();
    });

    // :Ex - Vim traditional command for file explorer
    Vim.defineEx('Ex', 'Ex', () => {
      this.toggleExplorer();
    });

    // :layout - Set layout preset
    Vim.defineEx('layout', 'lay', (_cm: any, params: any) => {
      const preset = params.args?.[0];
      if (preset) {
        this.applyLayoutPreset(preset);
      } else {
        this.showLayoutHelp();
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

  /**
   * Periodically syncs system clipboard content to the Vim register cache
   * This enables "*p to paste from system clipboard
   * @param register - The clipboard register object
   * @private
   */
  private syncClipboardToCache(register: { _cachedText: string }): void {
    // Sync when editor gains focus
    this.editor.onDidFocusEditorText(async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          register._cachedText = text;
        }
      } catch (err) {
        // Clipboard read may fail due to permissions - ignore silently
      }
    });
  }

  /**
   * Sets up key mappings for clipboard operations ("*y, "*p, "+y, "+p)
   * This provides clipboard support even if defineRegister is not available
   * @private
   */
  private setupClipboardMappings(): void {
    // Track the register selection state
    let pendingRegister: string | null = null;
    let pendingRegisterTimeout: ReturnType<typeof setTimeout> | null = null;
    
    const self = this;
    
    // Use capture phase to intercept before monaco-vim processes the keys
    this.editorContainer.addEventListener('keydown', (e) => {
      // Only handle in normal/visual mode when Vim is enabled
      if (!self.settings.vimEnabled) return;
      
      const key = e.key;
      
      // Detect " key (register prefix)
      if (key === '"' && pendingRegister === null) {
        pendingRegister = 'waiting';
        // Clear after timeout
        if (pendingRegisterTimeout) clearTimeout(pendingRegisterTimeout);
        pendingRegisterTimeout = setTimeout(() => {
          pendingRegister = null;
        }, 1000);
        return;
      }
      
      // Detect * or + after "
      if (pendingRegister === 'waiting' && (key === '*' || key === '+')) {
        pendingRegister = key;
        if (pendingRegisterTimeout) clearTimeout(pendingRegisterTimeout);
        pendingRegisterTimeout = setTimeout(() => {
          pendingRegister = null;
        }, 1000);
        return;
      }
      
      // Handle y (yank) after "* or "+
      if (pendingRegister === '*' || pendingRegister === '+') {
        if (key === 'y') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          self.yankToClipboard();
          pendingRegister = null;
          return;
        }
        
        // Handle p (paste) after "* or "+
        if (key === 'p' || key === 'P') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          self.pasteFromClipboardVim(key === 'P');
          pendingRegister = null;
          return;
        }
        
        // Any other key resets the state
        pendingRegister = null;
      }
    }, true);  // Use capture phase
  }

  /**
   * Pastes text from system clipboard (Vim-style)
   * @param before - If true, paste before cursor (P), otherwise after (p)
   * @private
   */
  private async pasteFromClipboardVim(before: boolean): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        this.fileStatus.textContent = '(clipboard is empty)';
        return;
      }
      
      const position = this.editor.getPosition();
      if (!position) return;
      
      const model = this.editor.getModel();
      if (!model) return;
      
      // Check if text is linewise (ends with newline)
      const isLinewise = text.endsWith('\n');
      
      let range: monaco.Range;
      let insertText = text;
      
      if (isLinewise) {
        // Linewise paste: insert on new line
        if (before) {
          // P: insert above current line
          range = new monaco.Range(position.lineNumber, 1, position.lineNumber, 1);
        } else {
          // p: insert below current line
          const lineCount = model.getLineCount();
          const lineLength = model.getLineLength(position.lineNumber);
          range = new monaco.Range(position.lineNumber, lineLength + 1, position.lineNumber, lineLength + 1);
          insertText = '\n' + text.replace(/\n$/, '');
        }
      } else {
        // Characterwise paste
        if (before) {
          // P: insert before cursor
          range = new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);
        } else {
          // p: insert after cursor
          range = new monaco.Range(position.lineNumber, position.column + 1, position.lineNumber, position.column + 1);
        }
      }
      
      this.editor.executeEdits('clipboard-paste', [{
        range: range,
        text: insertText,
      }]);
      
      this.modified = true;
      this.fileStatus.textContent = '(pasted from clipboard)';
      setTimeout(() => {
        if (this.fileStatus.textContent === '(pasted from clipboard)') {
          this.fileStatus.textContent = this.modified ? '(modified)' : '';
        }
      }, 1500);
      
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

  }

  private quit(force: boolean = false): void {
    if (this.modified && !force) {
      // Show warning in statusbar
      this.fileStatus.textContent = '(unsaved changes - use :q! to force)';
      return;
    }
    
    // Check if running in Tauri environment
    if ((window as any).__TAURI__) {
      // Close the window via Tauri API
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        const win = getCurrentWindow();
        win.close().catch((err: Error) => {
          console.error('Failed to close window:', err);
          // Fallback: try to destroy the window
          win.destroy().catch(() => {
            // Last resort: clear editor
            this.newFile();
          });
        });
      }).catch((err) => {
        console.error('Failed to import window API:', err);
        this.newFile();
      });
    } else {
      // Browser mode: just clear the editor
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
      
      // Check if it's a .mdvim or .mdebook file
      if (resolvedPath.endsWith('.mdvim') || resolvedPath.endsWith('.mdebook')) {
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
  
  // ========== Import Methods ==========
  
  /**
   * Shows import dialog to select files or enter URL
   * @private
   */
  private async showImportDialog(): Promise<void> {
    // Try to use Tauri file dialog
    if (tauriDialog) {
      try {
        const selected = await tauriDialog.open({
          multiple: true,
          filters: [
            { name: 'Markdown', extensions: ['md', 'markdown'] },
            { name: 'mdvim Project', extensions: ['mdvim', 'mdebook'] },
            { name: 'All Files', extensions: ['*'] }
          ],
          title: 'Import Files'
        });
        
        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected];
          for (const filePath of paths) {
            await this.importFromPath(filePath);
          }
        }
        return;
      } catch (err) {
        console.log('Tauri dialog failed:', err);
      }
    }
    
    // Fallback: prompt for URL or show info
    const input = prompt('インポートするファイルパス、URL、またはQiitaのURLを入力してください:');
    if (input && input.trim()) {
      await this.importFromPath(input.trim());
    }
  }
  
  /**
   * Import from file path, URL, or Qiita URL
   * @param path - File path or URL to import
   * @private
   */
  private async importFromPath(path: string): Promise<void> {
    this.fileStatus.textContent = '(importing...)';
    
    try {
      // Check if it's a URL
      if (path.startsWith('http://') || path.startsWith('https://')) {
        await this.importFromUrl(path);
        return;
      }
      
      // It's a file path
      const ext = path.toLowerCase().split('.').pop() || '';
      
      if (ext === 'mdvim' || ext === 'mdebook') {
        // Import project file
        await this.importProjectFile(path);
      } else if (ext === 'md' || ext === 'markdown') {
        // Import markdown file
        await this.importMarkdownFile(path);
      } else {
        // Try to treat as markdown
        await this.importMarkdownFile(path);
      }
    } catch (err) {
      console.error('Import failed:', err);
      this.fileStatus.textContent = `(import failed: ${err})`;
    }
  }
  
  /**
   * Import markdown from URL (add to project if in project mode)
   * @param url - URL to import from
   * @private
   */
  private async importFromUrl(url: string): Promise<void> {
    // Normalize URL for known services
    const markdownUrl = this.normalizeMarkdownUrl(url);
    
    let content: string;
    
    // Fetch content
    if (tauriHttp) {
      const response = await tauriHttp.fetch(markdownUrl, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      content = await response.text();
    } else {
      const response = await fetch(markdownUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      content = await response.text();
    }
    
    // Extract base URL and process images
    const baseUrl = this.getBaseUrl(url);
    content = await this.processAndEmbedImages(content, baseUrl);
    
    const fileName = this.getFileNameFromUrl(url);
    
    // If in project mode, add as new file
    if (this.projectState.isProject) {
      const id = this.generateUUID();
      const name = fileName.replace(/\.md$/, '');
      const maxOrder = Math.max(0, ...Array.from(this.projectState.files.values()).map(f => f.order ?? 0));
      
      const file: EditorFile = {
        id,
        path: fileName,
        name,
        content,
        modified: true,
        order: maxOrder + 1,
      };
      
      this.projectState.files.set(id, file);
      this.projectState.modifiedFiles.add(id);
      
      if (this.projectState.manifest) {
        this.projectState.manifest.files.push({
          id,
          path: fileName,
          name,
          order: maxOrder + 1,
        });
      }
      
      this.buildFileTree();
      this.openFileInProject(id);
      this.updateProjectUI();
      this.fileStatus.textContent = `(imported: ${fileName})`;
    } else {
      // Single file mode - just open the content
      this.editor.setValue(content);
      this.fileName = fileName;
      this.fileNameEl.textContent = this.fileName;
      this.modified = true;
      this.fileStatus.textContent = '(imported from web)';
    }
    
    setTimeout(() => {
      if (this.modified) this.fileStatus.textContent = '(modified)';
    }, 2000);
  }
  
  /**
   * Import a local markdown file
   * @param filePath - Path to the markdown file
   * @private
   */
  private async importMarkdownFile(filePath: string): Promise<void> {
    if (!tauriFs) {
      this.fileStatus.textContent = '(file import requires Tauri)';
      return;
    }
    
    const content = await tauriFs.readTextFile(filePath);
    const fileName = filePath.split(/[/\\]/).pop() || 'imported.md';
    
    // If in project mode, add as new file
    if (this.projectState.isProject) {
      const id = this.generateUUID();
      const name = fileName.replace(/\.md$/, '');
      const maxOrder = Math.max(0, ...Array.from(this.projectState.files.values()).map(f => f.order ?? 0));
      
      const file: EditorFile = {
        id,
        path: fileName,
        name,
        content,
        modified: true,
        order: maxOrder + 1,
      };
      
      this.projectState.files.set(id, file);
      this.projectState.modifiedFiles.add(id);
      
      if (this.projectState.manifest) {
        this.projectState.manifest.files.push({
          id,
          path: fileName,
          name,
          order: maxOrder + 1,
        });
      }
      
      this.buildFileTree();
      this.openFileInProject(id);
      this.updateProjectUI();
      this.fileStatus.textContent = `(imported: ${fileName})`;
    } else {
      // Single file mode - open the file
      this.editor.setValue(content);
      this.currentFilePath = filePath;
      this.fileName = fileName;
      this.fileNameEl.textContent = this.fileName;
      this.modified = false;
      this.fileStatus.textContent = '';
    }
  }
  
  /**
   * Import a mdvim/mdebook project file
   * @param filePath - Path to the project file
   * @private
   */
  private async importProjectFile(filePath: string): Promise<void> {
    // Check for unsaved changes
    const hasUnsavedChanges = this.modified || (this.projectState.isProject && this.projectState.modifiedFiles.size > 0);
    
    if (hasUnsavedChanges) {
      const result = await this.confirmSaveBeforeAction('プロジェクトを開く前に現在の変更を保存しますか？');
      if (result === 'cancel') {
        this.fileStatus.textContent = '';
        return;
      }
      if (result === 'save') {
        await this.saveFile();
      }
    }
    
    // Load the project
    await this.loadMdvim(filePath);
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

  // ========== Progress Modal Methods ==========
  
  /**
   * Shows the progress modal
   * @param title - Title to display
   * @private
   */
  private showProgress(title: string): void {
    if (!this.progressModal) {
      this.progressModal = document.getElementById('progress-modal');
      this.progressBar = document.getElementById('progress-bar');
      this.progressText = document.getElementById('progress-text');
      this.progressDetail = document.getElementById('progress-detail');
      this.progressTitle = document.getElementById('progress-title');
    }
    
    if (this.progressModal) {
      this.progressModal.classList.remove('hidden');
      if (this.progressTitle) this.progressTitle.textContent = title;
      if (this.progressBar) this.progressBar.style.width = '0%';
      if (this.progressText) this.progressText.textContent = '0%';
      if (this.progressDetail) this.progressDetail.textContent = '';
    }
  }
  
  /**
   * Updates the progress modal
   * @param percent - Progress percentage (0-100)
   * @param detail - Optional detail text
   * @private
   */
  private updateProgress(percent: number, detail?: string): void {
    if (this.progressBar) {
      this.progressBar.style.width = `${percent}%`;
    }
    if (this.progressText) {
      this.progressText.textContent = `${Math.round(percent)}%`;
    }
    if (this.progressDetail && detail !== undefined) {
      this.progressDetail.textContent = detail;
    }
  }
  
  /**
   * Hides the progress modal
   * @private
   */
  private hideProgress(): void {
    if (this.progressModal) {
      this.progressModal.classList.add('hidden');
    }
  }

  // ========== New File Dialog Methods ==========
  
  /**
   * Shows the new file dialog
   * @param callback - Callback function when file is created
   * @private
   */
  private showNewFileDialog(callback: (fileName: string, content: string) => void): void {
    if (!this.newFileModal) {
      this.newFileModal = document.getElementById('newfile-modal');
      this.newFileNameInput = document.getElementById('newfile-name') as HTMLInputElement;
      
      // Setup event listeners (only once)
      document.getElementById('newfile-ok-btn')?.addEventListener('click', () => {
        this.confirmNewFileDialog(false);
      });
      
      document.getElementById('newfile-clipboard-btn')?.addEventListener('click', () => {
        this.confirmNewFileDialog(true);
      });
      
      document.getElementById('newfile-cancel-btn')?.addEventListener('click', () => {
        this.hideNewFileDialog();
      });
      
      document.getElementById('newfile-close-btn')?.addEventListener('click', () => {
        this.hideNewFileDialog();
      });
      
      // Enter key to confirm
      this.newFileNameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.confirmNewFileDialog(false);
        } else if (e.key === 'Escape') {
          this.hideNewFileDialog();
        }
      });
    }
    
    this.newFileCallback = callback;
    
    if (this.newFileModal && this.newFileNameInput) {
      this.newFileNameInput.value = 'untitled.md';
      this.newFileModal.classList.remove('hidden');
      this.newFileNameInput.select();
      this.newFileNameInput.focus();
    }
  }
  
  /**
   * Confirms the new file dialog
   * @param fromClipboard - Whether to get content from clipboard
   * @private
   */
  private async confirmNewFileDialog(fromClipboard: boolean): Promise<void> {
    if (!this.newFileNameInput || !this.newFileCallback) return;
    
    const fileName = this.newFileNameInput.value.trim();
    if (!fileName) return;
    
    let content = '';
    if (fromClipboard) {
      try {
        content = await navigator.clipboard.readText();
        if (!content) {
          this.fileStatus.textContent = '(clipboard is empty)';
          return;
        }
      } catch (err) {
        console.error('Failed to read clipboard:', err);
        this.fileStatus.textContent = '(failed to read clipboard)';
        return;
      }
    }
    
    // Save callback before hiding (which sets it to null)
    const callback = this.newFileCallback;
    this.hideNewFileDialog();
    callback(fileName, content);
  }
  
  /**
   * Hides the new file dialog
   * @private
   */
  private hideNewFileDialog(): void {
    if (this.newFileModal) {
      this.newFileModal.classList.add('hidden');
    }
    this.newFileCallback = null;
  }

  // ========== Export Methods ==========
  
  /**
   * Shows the export dialog modal
   * @private
   */
  private showExportDialog(): void {
    const modal = document.getElementById('export-modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    
    // Update format options based on scope
    this.updateExportFormatOptions();
    
    // Setup event listeners (only once)
    if (!modal.dataset.initialized) {
      modal.dataset.initialized = 'true';
      
      // Close button
      document.getElementById('export-close-btn')?.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
      
      // Cancel button
      document.getElementById('export-cancel-btn')?.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
      
      // Execute button
      document.getElementById('export-execute-btn')?.addEventListener('click', () => {
        this.executeExportFromDialog();
        modal.classList.add('hidden');
      });
      
      // Scope change - update format options
      document.querySelectorAll('input[name="export-scope"]').forEach(radio => {
        radio.addEventListener('change', () => {
          this.updateExportFormatOptions();
        });
      });
      
      // Click outside to close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    }
  }
  
  /**
   * Updates export format options based on selected scope
   * @private
   */
  private updateExportFormatOptions(): void {
    const scopeEl = document.querySelector('input[name="export-scope"]:checked') as HTMLInputElement;
    const formatEl = document.getElementById('export-format') as HTMLSelectElement;
    if (!scopeEl || !formatEl) return;
    
    const scope = scopeEl.value as ExportScope;
    const currentValue = formatEl.value;
    
    // Clear options
    formatEl.innerHTML = '';
    
    if (scope === 'current') {
      formatEl.innerHTML = `
        <option value="md">Markdown (images as files)</option>
        <option value="md-inline">Markdown (images inline)</option>
        <option value="html">HTML</option>
        <option value="pdf">PDF</option>
      `;
    } else {
      formatEl.innerHTML = `
        <option value="md">Markdown folder</option>
        <option value="md-merged">Markdown (merged into one file)</option>
        <option value="html">HTML (single page)</option>
        <option value="html-multi">HTML (multi-page site)</option>
        <option value="mdbook">mdbook format</option>
        <option value="pdf">PDF (merged)</option>
      `;
    }
    
    // Try to restore previous selection
    const option = formatEl.querySelector(`option[value="${currentValue}"]`);
    if (option) {
      formatEl.value = currentValue;
    }
  }
  
  /**
   * Executes export based on dialog selections
   * @private
   */
  private async executeExportFromDialog(): Promise<void> {
    const scopeEl = document.querySelector('input[name="export-scope"]:checked') as HTMLInputElement;
    const formatEl = document.getElementById('export-format') as HTMLSelectElement;
    const includeImagesEl = document.getElementById('export-include-images') as HTMLInputElement;
    const includeTocEl = document.getElementById('export-include-toc') as HTMLInputElement;
    const numberHeadingsEl = document.getElementById('export-number-headings') as HTMLInputElement;
    
    if (!scopeEl || !formatEl) return;
    
    const options: ExportOptions = {
      scope: scopeEl.value as ExportScope,
      format: formatEl.value as ExportFormat,
      includeImages: includeImagesEl?.checked ?? true,
      includeToc: includeTocEl?.checked ?? false,
      numberHeadings: numberHeadingsEl?.checked ?? false,
    };
    
    await this.executeExport(options);
  }
  
  /**
   * Handles export command from Vim
   * @param args - Command arguments (e.g., "md", "all md", "all merge")
   * @private
   */
  private async handleExportCommand(args: string): Promise<void> {
    const parts = args.toLowerCase().split(/\s+/);
    
    let scope: ExportScope = 'current';
    let format: ExportFormat = 'md';
    
    if (parts[0] === 'all') {
      scope = 'all';
      if (parts[1]) {
        format = this.parseExportFormat(parts[1]);
      }
    } else {
      format = this.parseExportFormat(parts[0]);
    }
    
    const options: ExportOptions = {
      scope,
      format,
      includeImages: true,
      includeToc: false,
      numberHeadings: false,
    };
    
    await this.executeExport(options);
  }
  
  /**
   * Parses export format from string
   * @param str - Format string
   * @returns ExportFormat
   * @private
   */
  private parseExportFormat(str: string): ExportFormat {
    switch (str) {
      case 'md':
      case 'markdown':
        return 'md';
      case 'md-inline':
      case 'inline':
        return 'md-inline';
      case 'merge':
      case 'merged':
      case 'md-merged':
        return 'md-merged';
      case 'html':
        return 'html';
      case 'html-multi':
      case 'site':
        return 'html-multi';
      case 'pdf':
        return 'pdf';
      case 'epub':
        return 'epub';
      case 'mdbook':
      case 'book':
        return 'mdbook';
      default:
        return 'md';
    }
  }
  
  /**
   * Executes export with given options
   * @param options - Export options
   * @private
   */
  private async executeExport(options: ExportOptions): Promise<void> {
    this.fileStatus.textContent = '(exporting...)';
    
    try {
      if (options.scope === 'current') {
        await this.exportCurrentPage(options);
      } else {
        await this.exportAllPages(options);
      }
    } catch (err) {
      console.error('Export failed:', err);
      this.fileStatus.textContent = `(export failed: ${err})`;
    }
  }
  
  /**
   * Exports the current page
   * @param options - Export options
   * @private
   */
  private async exportCurrentPage(options: ExportOptions): Promise<void> {
    switch (options.format) {
      case 'md':
        await this.exportCurrentMarkdown(false);
        break;
      case 'md-inline':
        await this.exportCurrentMarkdown(true);
        break;
      case 'html':
        await this.exportToHtml();
        break;
      case 'pdf':
        await this.exportToPdf();
        break;
      default:
        this.fileStatus.textContent = `(format "${options.format}" not supported for single page)`;
    }
  }
  
  /**
   * Exports all pages in project
   * @param options - Export options
   * @private
   */
  private async exportAllPages(options: ExportOptions): Promise<void> {
    if (!this.projectState.isProject) {
      this.fileStatus.textContent = '(not in project mode)';
      return;
    }
    
    switch (options.format) {
      case 'md':
        await this.exportAllToMarkdownFolder(options);
        break;
      case 'md-merged':
        await this.exportAllToMergedMarkdown(options);
        break;
      case 'html':
        await this.exportAllToSingleHtml(options);
        break;
      case 'html-multi':
        await this.exportAllToHtmlSite(options);
        break;
      case 'mdbook':
        await this.exportToMdbook(options);
        break;
      case 'pdf':
        await this.exportAllToPdf(options);
        break;
      default:
        this.fileStatus.textContent = `(format "${options.format}" not yet implemented)`;
    }
  }
  
  /**
   * Exports current page as Markdown file
   * @param inlineImages - Whether to keep images as inline base64
   * @private
   */
  private async exportCurrentMarkdown(inlineImages: boolean): Promise<void> {
    if (!tauriDialog || !tauriFs) {
      this.fileStatus.textContent = '(export requires Tauri)';
      return;
    }
    
    const baseName = this.projectState.isProject && this.projectState.activeFileId
      ? (this.projectState.files.get(this.projectState.activeFileId)?.name || 'export')
      : this.fileName.replace(/\.[^.]+$/, '');
    
    if (inlineImages) {
      // Save as single MD file with inline base64 images
      const filePath = await tauriDialog.save({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        defaultPath: baseName + '.md'
      });
      
      if (filePath) {
        const content = this.editor.getValue();
        await tauriFs.writeTextFile(filePath, content);
        this.fileStatus.textContent = '(exported)';
      }
    } else {
      // Save MD file + images folder
      const dirPath = await tauriDialog.open({
        directory: true,
        title: 'Select export folder'
      });
      
      if (dirPath && typeof dirPath === 'string') {
        const content = this.editor.getValue();
        const { markdown, images } = this.extractAndReplaceImages(content, 'images');
        
        // Write markdown file
        const mdPath = `${dirPath}/${baseName}.md`;
        await tauriFs.writeTextFile(mdPath, markdown);
        
        // Write images
        if (images.size > 0) {
          const imagesDir = `${dirPath}/images`;
          await tauriFs.mkdir(imagesDir, { recursive: true });
          
          for (const [filename, data] of images) {
            const imagePath = `${imagesDir}/${filename}`;
            const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            await tauriFs.writeFile(imagePath, binary);
          }
        }
        
        this.fileStatus.textContent = '(exported)';
      }
    }
  }
  
  /**
   * Extracts embedded images from content and returns modified markdown
   * @param content - Markdown content
   * @param imageDir - Directory name for images
   * @returns Object with modified markdown and image map
   * @private
   */
  private extractAndReplaceImages(content: string, imageDir: string): { markdown: string; images: Map<string, string> } {
    const images = new Map<string, string>();
    
    // Replace images/xxx references with extracted images
    const markdown = content.replace(/!\[([^\]]*)\]\(images\/([^)]+)\)/g, (match, alt, imageId) => {
      const image = this.images.get(imageId);
      if (image) {
        const ext = image.mimeType.split('/')[1] || 'png';
        const filename = imageId.includes('.') ? imageId : `${imageId}.${ext}`;
        images.set(filename, image.data);
        return `![${alt}](${imageDir}/${filename})`;
      }
      return match;
    });
    
    return { markdown, images };
  }
  
  /**
   * Exports all project pages to a folder with separate MD files
   * @param options - Export options
   * @private
   */
  private async exportAllToMarkdownFolder(options: ExportOptions): Promise<void> {
    if (!tauriDialog || !tauriFs) {
      this.fileStatus.textContent = '(export requires Tauri)';
      return;
    }
    
    const dirPath = await tauriDialog.open({
      directory: true,
      title: 'Select export folder'
    });
    
    if (!dirPath || typeof dirPath !== 'string') return;
    
    this.showProgress('Exporting Markdown files...');
    
    const files = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    const allImages = new Map<string, string>();
    
    // Export each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = (i / files.length) * 70;
      this.updateProgress(progress, `Exporting: ${file.name} (${i + 1}/${files.length})`);
      
      const { markdown, images } = this.extractAndReplaceImages(file.content, 'images');
      
      // Add number prefix for ordering
      const prefix = String(i + 1).padStart(2, '0');
      const filename = `${prefix}-${file.name}.md`;
      
      await tauriFs.writeTextFile(`${dirPath}/${filename}`, markdown);
      
      // Collect images
      for (const [name, data] of images) {
        allImages.set(name, data);
      }
    }
    
    // Export images
    if (allImages.size > 0 && options.includeImages) {
      this.updateProgress(75, 'Exporting images...');
      const imagesDir = `${dirPath}/images`;
      await tauriFs.mkdir(imagesDir, { recursive: true });
      
      const imageEntries = Array.from(allImages.entries());
      for (let i = 0; i < imageEntries.length; i++) {
        const [filename, data] = imageEntries[i];
        const progress = 75 + (i / imageEntries.length) * 20;
        this.updateProgress(progress, `Exporting image: ${filename}`);
        
        const imagePath = `${imagesDir}/${filename}`;
        const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        await tauriFs.writeFile(imagePath, binary);
      }
    }
    
    this.updateProgress(100, 'Complete!');
    setTimeout(() => {
      this.hideProgress();
      this.fileStatus.textContent = `(exported ${files.length} files)`;
    }, 500);
  }
  
  /**
   * Exports all project pages merged into a single markdown file
   * @param options - Export options
   * @private
   */
  private async exportAllToMergedMarkdown(options: ExportOptions): Promise<void> {
    if (!tauriDialog || !tauriFs) {
      this.fileStatus.textContent = '(export requires Tauri)';
      return;
    }
    
    const projectName = this.projectState.manifest?.metadata?.title || 'project';
    
    const filePath = await tauriDialog.save({
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultPath: projectName + '.md'
    });
    
    if (!filePath) return;
    
    const files = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    let mergedContent = '';
    
    // Add TOC if requested
    if (options.includeToc) {
      mergedContent += '# Table of Contents\n\n';
      for (const file of files) {
        const anchor = file.name.toLowerCase().replace(/\s+/g, '-');
        mergedContent += `- [${file.name}](#${anchor})\n`;
      }
      mergedContent += '\n---\n\n';
    }
    
    // Merge all files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (i > 0) {
        mergedContent += '\n\n---\n\n';
      }
      
      let content = file.content;
      
      // Add heading numbers if requested
      if (options.numberHeadings) {
        content = this.addHeadingNumbers(content, i + 1);
      }
      
      mergedContent += content;
    }
    
    await tauriFs.writeTextFile(filePath, mergedContent);
    this.fileStatus.textContent = `(exported ${files.length} files merged)`;
  }
  
  /**
   * Adds chapter numbers to headings
   * @param content - Markdown content
   * @param chapterNum - Chapter number
   * @returns Modified content
   * @private
   */
  private addHeadingNumbers(content: string, chapterNum: number): string {
    let h2Count = 0;
    let h3Count = 0;
    
    return content.replace(/^(#{1,3})\s+(.+)$/gm, (match, hashes, title) => {
      const level = hashes.length;
      
      if (level === 1) {
        h2Count = 0;
        h3Count = 0;
        return `# ${chapterNum}. ${title}`;
      } else if (level === 2) {
        h2Count++;
        h3Count = 0;
        return `## ${chapterNum}.${h2Count} ${title}`;
      } else if (level === 3) {
        h3Count++;
        return `### ${chapterNum}.${h2Count}.${h3Count} ${title}`;
      }
      
      return match;
    });
  }
  
  /**
   * Exports all project pages to a single HTML file
   * @param options - Export options
   * @private
   */
  private async exportAllToSingleHtml(options: ExportOptions): Promise<void> {
    if (!tauriDialog || !tauriFs) {
      this.fileStatus.textContent = '(export requires Tauri)';
      return;
    }
    
    const projectName = this.projectState.manifest?.metadata?.title || 'project';
    
    const filePath = await tauriDialog.save({
      filters: [{ name: 'HTML', extensions: ['html'] }],
      defaultPath: projectName + '.html'
    });
    
    if (!filePath) return;
    
    const files = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    let bodyContent = '';
    
    // Add TOC if requested
    if (options.includeToc) {
      bodyContent += '<nav class="toc"><h2>Table of Contents</h2><ul>';
      for (const file of files) {
        const anchor = file.name.toLowerCase().replace(/\s+/g, '-');
        bodyContent += `<li><a href="#${anchor}">${file.name}</a></li>`;
      }
      bodyContent += '</ul></nav><hr>';
    }
    
    // Render all files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const anchor = file.name.toLowerCase().replace(/\s+/g, '-');
      
      if (i > 0) {
        bodyContent += '<hr class="page-break">';
      }
      
      let content = file.content;
      content = this.processImageSize(content);
      
      let htmlContent = marked.parse(content, { async: false }) as string;
      
      // Replace images with base64
      htmlContent = htmlContent.replace(/src="images\/([^"]+)"/g, (_match, imageId) => {
        const dataUrl = this.getImageDataUrl(imageId);
        return dataUrl ? `src="${dataUrl}"` : `src="images/${imageId}"`;
      });
      
      bodyContent += `<section id="${anchor}">${htmlContent}</section>`;
    }
    
    const html = this.wrapInHtmlTemplate(bodyContent, projectName);
    await tauriFs.writeTextFile(filePath, html);
    this.fileStatus.textContent = `(exported ${files.length} files as HTML)`;
  }
  
  /**
   * Wraps content in a complete HTML template
   * @param body - HTML body content
   * @param title - Page title
   * @returns Complete HTML document
   * @private
   */
  private wrapInHtmlTemplate(body: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
    pre { background: #f5f5f5; padding: 1em; overflow-x: auto; border-radius: 4px; }
    code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1em; color: #666; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.5em; text-align: left; }
    th { background: #f5f5f5; }
    .toc { background: #f9f9f9; padding: 1em; border-radius: 4px; margin-bottom: 2em; }
    .toc ul { margin: 0; padding-left: 1.5em; }
    .page-break { margin: 3em 0; }
    @media print { .page-break { page-break-before: always; } }
  </style>
</head>
<body>
${body}
</body>
</html>`;
  }
  
  /**
   * Exports all project pages to a multi-page HTML site
   * @param options - Export options
   * @private
   */
  private async exportAllToHtmlSite(options: ExportOptions): Promise<void> {
    if (!tauriDialog || !tauriFs) {
      this.fileStatus.textContent = '(export requires Tauri)';
      return;
    }
    
    const dirPath = await tauriDialog.open({
      directory: true,
      title: 'Select export folder'
    });
    
    if (!dirPath || typeof dirPath !== 'string') return;
    
    this.showProgress('Exporting HTML site...');
    
    const files = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    const projectName = this.projectState.manifest?.metadata?.title || 'Project';
    
    // Create index.html with navigation
    this.updateProgress(5, 'Creating index.html...');
    let indexHtml = `<h1>${projectName}</h1><nav><ul>`;
    for (const file of files) {
      const htmlName = file.name.toLowerCase().replace(/\s+/g, '-') + '.html';
      indexHtml += `<li><a href="${htmlName}">${file.name}</a></li>`;
    }
    indexHtml += '</ul></nav>';
    
    await tauriFs.writeTextFile(`${dirPath}/index.html`, this.wrapInHtmlTemplate(indexHtml, projectName));
    
    // Create individual HTML files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = 10 + (i / files.length) * 85;
      this.updateProgress(progress, `Exporting: ${file.name} (${i + 1}/${files.length})`);
      
      const htmlName = file.name.toLowerCase().replace(/\s+/g, '-') + '.html';
      
      let content = file.content;
      content = this.processImageSize(content);
      
      let htmlContent = marked.parse(content, { async: false }) as string;
      
      // Replace images with base64
      htmlContent = htmlContent.replace(/src="images\/([^"]+)"/g, (_match, imageId) => {
        const dataUrl = this.getImageDataUrl(imageId);
        return dataUrl ? `src="${dataUrl}"` : `src="images/${imageId}"`;
      });
      
      // Add navigation
      const nav = `<nav class="page-nav">
        <a href="index.html">← Index</a>
        ${i > 0 ? `<a href="${files[i-1].name.toLowerCase().replace(/\s+/g, '-')}.html">← ${files[i-1].name}</a>` : ''}
        ${i < files.length - 1 ? `<a href="${files[i+1].name.toLowerCase().replace(/\s+/g, '-')}.html">${files[i+1].name} →</a>` : ''}
      </nav>`;
      
      const body = nav + htmlContent + nav;
      
      await tauriFs.writeTextFile(`${dirPath}/${htmlName}`, this.wrapInHtmlTemplate(body, file.name));
    }
    
    this.updateProgress(100, 'Complete!');
    setTimeout(() => {
      this.hideProgress();
      this.fileStatus.textContent = `(exported ${files.length + 1} HTML files)`;
    }, 500);
  }
  
  /**
   * Exports project to mdbook format
   * @param options - Export options
   * @private
   */
  private async exportToMdbook(options: ExportOptions): Promise<void> {
    if (!tauriDialog || !tauriFs) {
      this.fileStatus.textContent = '(export requires Tauri)';
      return;
    }
    
    const dirPath = await tauriDialog.open({
      directory: true,
      title: 'Select export folder for mdbook'
    });
    
    if (!dirPath || typeof dirPath !== 'string') return;
    
    this.showProgress('Exporting mdbook format...');
    
    const metadata = this.projectState.manifest?.metadata || { title: 'Book' };
    const files = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    // Create book.toml
    this.updateProgress(5, 'Creating book.toml...');
    const bookToml = `[book]
title = "${metadata.title || 'Book'}"
${metadata.author ? `authors = ["${metadata.author}"]` : ''}
${metadata.language ? `language = "${metadata.language}"` : 'language = "ja"'}
${metadata.description ? `description = "${metadata.description}"` : ''}

[build]
build-dir = "book"
`;
    
    await tauriFs.writeTextFile(`${dirPath}/book.toml`, bookToml);
    
    // Create src directory
    this.updateProgress(10, 'Creating directory structure...');
    const srcDir = `${dirPath}/src`;
    await tauriFs.mkdir(srcDir, { recursive: true });
    
    // Create SUMMARY.md
    this.updateProgress(15, 'Creating SUMMARY.md...');
    let summary = '# Summary\n\n';
    for (const file of files) {
      summary += `- [${file.name}](./${file.path})\n`;
    }
    
    await tauriFs.writeTextFile(`${srcDir}/SUMMARY.md`, summary);
    
    // Export each file
    const allImages = new Map<string, string>();
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = 20 + (i / files.length) * 50;
      this.updateProgress(progress, `Exporting: ${file.name} (${i + 1}/${files.length})`);
      
      const { markdown, images } = this.extractAndReplaceImages(file.content, 'images');
      await tauriFs.writeTextFile(`${srcDir}/${file.path}`, markdown);
      
      for (const [name, data] of images) {
        allImages.set(name, data);
      }
    }
    
    // Export images
    if (allImages.size > 0 && options.includeImages) {
      this.updateProgress(75, 'Exporting images...');
      const imagesDir = `${srcDir}/images`;
      await tauriFs.mkdir(imagesDir, { recursive: true });
      
      const imageEntries = Array.from(allImages.entries());
      for (let i = 0; i < imageEntries.length; i++) {
        const [filename, data] = imageEntries[i];
        const progress = 75 + (i / imageEntries.length) * 20;
        this.updateProgress(progress, `Exporting image: ${filename}`);
        
        const imagePath = `${imagesDir}/${filename}`;
        const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        await tauriFs.writeFile(imagePath, binary);
      }
    }
    
    this.updateProgress(100, 'Complete!');
    setTimeout(() => {
      this.hideProgress();
      this.fileStatus.textContent = `(exported mdbook: ${files.length} chapters)`;
    }, 500);
  }
  
  /**
   * Exports all project pages to a merged PDF
   * @param options - Export options
   * @private
   */
  private async exportAllToPdf(options: ExportOptions): Promise<void> {
    if (!tauriDialog || !tauriFs) {
      this.fileStatus.textContent = '(export requires Tauri)';
      return;
    }
    
    const projectName = this.projectState.manifest?.metadata?.title || 'project';
    
    const filePath = await tauriDialog.save({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: projectName + '.pdf'
    });
    
    if (!filePath) return;
    
    this.showProgress('Generating PDF...');
    
    try {
      // Dynamic import for PDF libraries
      this.updateProgress(5, 'Loading libraries...');
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ]);
      
      const files = Array.from(this.projectState.files.values())
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      
      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      let isFirstPage = true;
      
      // Add TOC if requested
      if (options.includeToc) {
        this.updateProgress(10, 'Creating table of contents...');
        pdf.setFontSize(24);
        pdf.text('Table of Contents', 20, 30);
        pdf.setFontSize(12);
        let tocY = 50;
        for (let i = 0; i < files.length; i++) {
          pdf.text(`${i + 1}. ${files[i].name}`, 25, tocY);
          tocY += 8;
          if (tocY > pdfHeight - 20) {
            pdf.addPage();
            tocY = 30;
          }
        }
        isFirstPage = false;
      }
      
      // Create a temporary container for rendering
      const tempDiv = document.createElement('div');
      tempDiv.style.cssText = `
        position: absolute;
        left: -9999px;
        top: 0;
        width: 170mm;
        padding: 0;
        background: white;
        color: black;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 11pt;
        line-height: 1.5;
      `;
      document.body.appendChild(tempDiv);
      
      const baseProgress = options.includeToc ? 15 : 10;
      const progressPerFile = (85 - baseProgress) / files.length;
      
      // Process each file
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        const currentProgress = baseProgress + progressPerFile * fileIndex;
        this.updateProgress(currentProgress, `Processing: ${file.name} (${fileIndex + 1}/${files.length})`);
        
        // Render markdown to HTML
        let content = file.content;
        content = this.processImageSize(content);
        let htmlContent = marked.parse(content, { async: false }) as string;
        
        // Replace images with base64
        htmlContent = htmlContent.replace(/src="images\/([^"]+)"/g, (_match, imageId) => {
          const dataUrl = this.getImageDataUrl(imageId);
          return dataUrl ? `src="${dataUrl}"` : `src="images/${imageId}"`;
        });
        
        tempDiv.innerHTML = htmlContent;
        
        // Force black color for KaTeX elements
        const katexElements = tempDiv.querySelectorAll('.katex, .katex *');
        katexElements.forEach(el => {
          (el as HTMLElement).style.color = 'black';
        });
        
        // Render to canvas
        const canvas = await html2canvas(tempDiv, {
          scale: 2,
          useCORS: true,
          logging: false,
        });
        
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        
        // Calculate scaling
        const contentWidth = pdfWidth - 40; // 20mm margins
        const scale = contentWidth / imgWidth * 2; // scale factor from html2canvas
        const scaledHeight = imgHeight * scale / 2;
        
        // Add page break before each chapter (except first if no TOC)
        if (!isFirstPage) {
          pdf.addPage();
        }
        isFirstPage = false;
        
        // Handle multi-page content for this chapter
        const maxHeightPerPage = pdfHeight - 40; // 20mm top/bottom margins
        let remainingHeight = scaledHeight;
        let sourceY = 0;
        
        while (remainingHeight > 0) {
          const heightToDraw = Math.min(remainingHeight, maxHeightPerPage);
          const sourceHeight = heightToDraw / scale * 2;
          
          // Create a canvas slice
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sourceHeight;
          const ctx = sliceCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);
            const sliceData = sliceCanvas.toDataURL('image/png');
            pdf.addImage(sliceData, 'PNG', 20, 20, contentWidth, heightToDraw);
          }
          
          remainingHeight -= heightToDraw;
          sourceY += sourceHeight;
          
          if (remainingHeight > 0) {
            pdf.addPage();
          }
        }
      }
      
      document.body.removeChild(tempDiv);
      
      // Save PDF
      this.updateProgress(90, 'Saving PDF...');
      const pdfBlob = pdf.output('arraybuffer');
      await tauriFs.writeFile(filePath, new Uint8Array(pdfBlob));
      
      this.updateProgress(100, 'Complete!');
      
      setTimeout(() => {
        this.hideProgress();
        this.fileStatus.textContent = `(PDF exported: ${files.length} chapters)`;
        
        setTimeout(() => {
          if (!this.modified && this.projectState.modifiedFiles.size === 0) {
            this.fileStatus.textContent = '';
          }
        }, 3000);
      }, 500);
      
    } catch (err) {
      console.error('PDF export error:', err);
      this.hideProgress();
      this.fileStatus.textContent = '(PDF export failed)';
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
      width: 170mm;
      padding: 0;
      background: white;
      color: black;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
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
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 20; // 20mm margins
      const contentWidth = pdfWidth - margin * 2;
      const contentHeight = pdfHeight - margin * 2;
      
      // Calculate scale to fit content width
      const scale = contentWidth / (canvas.width / 2); // html2canvas scale is 2
      const scaledPageHeight = contentHeight / scale * 2;
      
      // Calculate how many pages we need
      const totalPages = Math.ceil(canvas.height / scaledPageHeight);
      
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }
        
        // Calculate the portion of the canvas to draw
        const sourceY = page * scaledPageHeight;
        const sourceHeight = Math.min(scaledPageHeight, canvas.height - sourceY);
        const destHeight = sourceHeight * scale / 2;
        
        // Create a slice of the canvas
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sourceHeight;
        const ctx = sliceCanvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(
            canvas,
            0, sourceY, canvas.width, sourceHeight,
            0, 0, canvas.width, sourceHeight
          );
          
          const sliceData = sliceCanvas.toDataURL('image/png');
          pdf.addImage(sliceData, 'PNG', margin, margin, contentWidth, destHeight);
        }
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

  /**
   * Toggles the Table of Contents panel visibility
   * @private
   */
  private toggleToc(): void {
    this.layoutSettings.visibility.toc = !this.layoutSettings.visibility.toc;
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
    
    // Split by \n and remove trailing \r for CRLF compatibility
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      // Remove trailing \r for CRLF line endings
      const normalizedLine = line.replace(/\r$/, '');
      // Only match H1-H3 (#{1,3})
      const match = normalizedLine.match(/^(#{1,3})\s+(.+)$/);
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

  /**
   * Toggles Vim mode on/off
   * Initializes or disposes Vim mode handler
   * @private
   */
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
        const target = e.currentTarget as HTMLElement;
        const view = target.dataset.view as ViewMode;
        if (view) {
          this.setViewMode(view);
        }
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

    // Explorer toggle button
    document.getElementById('btn-explorer-toggle')?.addEventListener('click', () => {
      this.toggleExplorer();
    });

    // New file/folder buttons in explorer
    document.getElementById('new-file-btn')?.addEventListener('click', () => {
      this.showNewFileDialog((fileName, content) => {
        this.createNewFileInProject(fileName, content);
      });
    });
    document.getElementById('new-folder-btn')?.addEventListener('click', () => {
      // Folder creation - for now just show info
      this.fileStatus.textContent = '(folder creation not yet implemented)';
    });
    document.getElementById('refresh-tree-btn')?.addEventListener('click', () => {
      this.buildFileTree();
      this.updateExplorerUI();
    });
    
    // Search button and panel
    document.getElementById('search-btn')?.addEventListener('click', () => {
      this.toggleSearchPanel();
    });
    document.getElementById('search-close-btn')?.addEventListener('click', () => {
      this.closeSearchPanel();
    });
    document.getElementById('search-input')?.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      this.searchInProject(query);
    });
    document.getElementById('search-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeSearchPanel();
      }
    });

    // New tab button
    document.getElementById('new-tab-btn')?.addEventListener('click', () => {
      this.showNewFileDialog((fileName, content) => {
        this.createNewFileInProject(fileName, content);
      });
    });

    // Keyboard shortcuts for project
    document.addEventListener('keydown', (e) => {
      // Ctrl+E: Toggle Explorer
      if (e.ctrlKey && e.key === 'e' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        this.toggleExplorer();
      }
      // Ctrl+Shift+F: Search in project
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        if (this.projectState.isProject) {
          this.toggleSearchPanel();
        }
      }
      // Ctrl+Tab: Next buffer
      if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        this.nextBuffer();
      }
      // Ctrl+Shift+Tab: Previous buffer
      if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        this.prevBuffer();
      }
      // Alt+Left: Go back in history
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        this.goBackInHistory();
      }
      // Alt+Right: Go forward in history
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        this.goForwardInHistory();
      }
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
    // Only for EXTERNAL file drops (not internal reordering)
    const mainContent = document.getElementById('main-content')!;
    
    // Helper: Check if this is an external file drag (not internal reorder)
    const isExternalFileDrag = (ev: DragEvent): boolean => {
      const dt = ev.dataTransfer;
      if (!dt) return false;
      
      // Internal drag uses custom MIME type - ignore it
      if (dt.types.includes('application/x-mdvim-internal')) {
        return false;
      }
      
      // Check for actual files
      if (dt.files && dt.files.length > 0) return true;
      
      return Array.from(dt.types).includes('Files');
    };
    
    mainContent.addEventListener('dragenter', (e) => {
      if (!isExternalFileDrag(e as DragEvent)) return;
      e.preventDefault();
      e.stopPropagation();
      this.editorContainer.classList.add('drag-over');
    });
    
    mainContent.addEventListener('dragover', (e) => {
      if (!isExternalFileDrag(e as DragEvent)) return;
      e.preventDefault();
      e.stopPropagation();
    });
    
    mainContent.addEventListener('dragleave', (e) => {
      if (!isExternalFileDrag(e as DragEvent)) return;
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
      if (!isExternalFileDrag(e as DragEvent)) return;
      e.preventDefault();
      e.stopPropagation();
      this.editorContainer.classList.remove('drag-over');
      
      // In Tauri environment, file drops are handled by tauri://drag-drop event
      // Browser drop event won't have file data in Tauri
      if (tauriFs) {
        return;
      }
      
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
        // Close new file modal on Escape
        const newFileModal = document.getElementById('newfile-modal');
        if (newFileModal && !newFileModal.classList.contains('hidden')) {
          this.hideNewFileDialog();
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
      } else if (e.ctrlKey && (e.key === '`' || e.code === 'Backquote')) {
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

  /**
   * Sets the view mode (editor only, split, or preview only)
   * Updates UI and saves setting
   * @param mode - The view mode to set
   * @private
   */
  private setViewMode(mode: ViewMode): void {
    this.settings.viewMode = mode;
    document.getElementById('app')!.dataset.viewMode = mode;

    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === mode);
    });

    setTimeout(() => this.editor.layout(), 0);
    this.saveSettings();
  }

  /**
   * Sets the color theme
   * Updates CSS variables, Monaco theme, and saves setting
   * @param theme - The theme to apply
   * @private
   */
  private setTheme(theme: Theme): void {
    this.settings.theme = theme;
    document.documentElement.dataset.theme = theme;
    monaco.editor.setTheme(monacoThemeMap[theme]);
    this.themeSelector.value = theme;
    this.saveSettings();
  }

  /**
   * Sets the editor font size
   * Updates Monaco editor options and saves setting
   * @param size - Font size percentage (50-200)
   * @private
   */
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

  /**
   * Debounced version of updatePreview
   * Delays preview updates to avoid excessive rendering during typing
   * @private
   */
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

  /**
   * Updates the preview pane with rendered Markdown
   * Processes Markdown with Mermaid diagrams, KaTeX math, Obsidian callouts,
   * embedded images, and syntax highlighting
   * @private
   */
  private updatePreview(): void {
    try {
      let content = this.editor.getValue();
      
      // Process YAML frontmatter (Obsidian compatible)
      let frontmatter: Record<string, string> | null = null;
      content = content.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/, (_, yamlContent) => {
        frontmatter = {};
        yamlContent.split(/\r?\n/).forEach((line: string) => {
          const match = line.match(/^(\w+):\s*(.*)$/);
          if (match && frontmatter) {
            frontmatter[match[1]] = match[2].replace(/^["']|["']$/g, '');
          }
        });
        return ''; // Remove frontmatter from content
      });
      
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
        /^:::note\s*(info|warn|alert)?\s*\r?\n([\s\S]*?)^:::\s*$/gm,
        (_, type, innerContent) => {
          const index = qiitaNotes.length;
          qiitaNotes.push({ type: type || 'info', body: innerContent.trim() });
          return `<!--QIITA_NOTE_${index}-->`;
        }
      );
      
      // Convert GitHub alerts to placeholder before markdown parsing
      const ghAlerts: Array<{ type: string; body: string }> = [];
      content = content.replace(
        /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\r?\n((?:>\s*.*(?:\r?\n|$))*)/gm,
        (_, type, innerContent) => {
          const index = ghAlerts.length;
          const body = innerContent
            .split(/\r?\n/)
            .map((line: string) => line.replace(/^>\s?/, ''))
            .join('\n')
            .trim();
          ghAlerts.push({ type, body });
          return `<!--GH_ALERT_${index}-->`;
        }
      );
      
      // Convert Obsidian Callouts to placeholder: > [!note] Title
      const obsidianCallouts: Array<{ type: string; title: string; body: string }> = [];
      content = content.replace(
        /^>\s*\[!(\w+)\](?:\s+(.+))?\s*\r?\n((?:>\s*.*(?:\r?\n|$))*)/gm,
        (_, type, title, innerContent) => {
          const index = obsidianCallouts.length;
          const body = innerContent
            .split(/\r?\n/)
            .map((line: string) => line.replace(/^>\s?/, ''))
            .join('\n')
            .trim();
          obsidianCallouts.push({ type: type.toLowerCase(), title: title || '', body });
          return `<!--OBSIDIAN_CALLOUT_${index}-->`;
        }
      );
      
      // Process Obsidian WikiLinks: [[page]] or [[page|display]]
      content = content.replace(
        /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
        (_, page, display) => {
          const linkText = display || page;
          return `<span class="wikilink" data-page="${page}">${linkText}</span>`;
        }
      );
      
      // Process Obsidian image embeds: ![[image.png]] or ![[image.png|300]]
      content = content.replace(
        /!\[\[([^\]|]+?)(?:\|(\d+))?\]\]/g,
        (_, filename, width) => {
          const widthAttr = width ? ` width="${width}"` : '';
          // Check if it's in our embedded images
          const image = this.images.get(filename);
          if (image) {
            return `<img src="data:${image.mimeType};base64,${image.data}" alt="${filename}"${widthAttr}>`;
          }
          // Otherwise, treat as relative path
          return `<img src="images/${filename}" alt="${filename}"${widthAttr}>`;
        }
      );
      
      // Process Obsidian comments: %%comment%%
      content = content.replace(/%%[^%]+%%/g, '');
      
      // Process Obsidian tags: #tag (but not in headings or code)
      // We'll handle this in post-processing to avoid conflicts
      
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
      
      // Replace Obsidian Callout placeholders with actual HTML
      const obsidianCalloutConfig: Record<string, { icon: string; className: string; label: string }> = {
        'note': { icon: '📝', className: 'obsidian-callout callout-note', label: 'Note' },
        'abstract': { icon: '📋', className: 'obsidian-callout callout-abstract', label: 'Abstract' },
        'summary': { icon: '📋', className: 'obsidian-callout callout-abstract', label: 'Summary' },
        'info': { icon: 'ℹ️', className: 'obsidian-callout callout-info', label: 'Info' },
        'todo': { icon: '☑️', className: 'obsidian-callout callout-todo', label: 'Todo' },
        'tip': { icon: '💡', className: 'obsidian-callout callout-tip', label: 'Tip' },
        'hint': { icon: '💡', className: 'obsidian-callout callout-tip', label: 'Hint' },
        'important': { icon: '🔥', className: 'obsidian-callout callout-important', label: 'Important' },
        'success': { icon: '✅', className: 'obsidian-callout callout-success', label: 'Success' },
        'check': { icon: '✅', className: 'obsidian-callout callout-success', label: 'Check' },
        'done': { icon: '✅', className: 'obsidian-callout callout-success', label: 'Done' },
        'question': { icon: '❓', className: 'obsidian-callout callout-question', label: 'Question' },
        'help': { icon: '❓', className: 'obsidian-callout callout-question', label: 'Help' },
        'faq': { icon: '❓', className: 'obsidian-callout callout-question', label: 'FAQ' },
        'warning': { icon: '⚠️', className: 'obsidian-callout callout-warning', label: 'Warning' },
        'caution': { icon: '⚠️', className: 'obsidian-callout callout-warning', label: 'Caution' },
        'attention': { icon: '⚠️', className: 'obsidian-callout callout-warning', label: 'Attention' },
        'failure': { icon: '❌', className: 'obsidian-callout callout-failure', label: 'Failure' },
        'fail': { icon: '❌', className: 'obsidian-callout callout-failure', label: 'Fail' },
        'missing': { icon: '❌', className: 'obsidian-callout callout-failure', label: 'Missing' },
        'danger': { icon: '⚡', className: 'obsidian-callout callout-danger', label: 'Danger' },
        'error': { icon: '⚡', className: 'obsidian-callout callout-danger', label: 'Error' },
        'bug': { icon: '🐛', className: 'obsidian-callout callout-bug', label: 'Bug' },
        'example': { icon: '📖', className: 'obsidian-callout callout-example', label: 'Example' },
        'quote': { icon: '💬', className: 'obsidian-callout callout-quote', label: 'Quote' },
        'cite': { icon: '💬', className: 'obsidian-callout callout-quote', label: 'Cite' },
      };
      html = html.replace(/<!--OBSIDIAN_CALLOUT_(\d+)-->/g, (_, indexStr) => {
        const index = parseInt(indexStr, 10);
        const callout = obsidianCallouts[index];
        if (!callout) return '';
        const config = obsidianCalloutConfig[callout.type] || obsidianCalloutConfig['note'];
        const titleText = callout.title || config.label;
        const bodyHtml = marked.parse(callout.body);
        const bodyContent = typeof bodyHtml === 'string' ? bodyHtml : '';
        return `<div class="${config.className}"><p class="callout-title">${config.icon} ${titleText}</p><div class="callout-content">${bodyContent}</div></div>`;
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
        { name: 'mdvim/mdebook', extensions: ['mdvim', 'mdebook'] },
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
      
      // Check if it's a .mdvim or .mdebook file
      if (filePath.endsWith('.mdvim') || filePath.endsWith('.mdebook')) {
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

  async newFile(): Promise<void> {
    if (this.modified) {
      const result = await this.confirmSaveBeforeAction('新規作成する前に現在の変更を保存しますか？');
      if (result === 'cancel') return;
      if (result === 'save') {
        await this.saveFile();
      }
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
    
    // In Tauri environment, file drops are handled by Tauri's drag-drop event
    // Browser handleDrop only handles files when NOT in Tauri (or for web-based drops)
    if (tauriFs && tauriEvent) {
      console.log('Skipping browser handleDrop - Tauri will handle file drops');
      return;
    }
    
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const ext = file.name.toLowerCase().split('.').pop() || '';
      
      // Handle image files (by type or extension)
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
      if (file.type.startsWith('image/') || imageExts.includes(ext)) {
        const id = await this.addImage(file, file.name);
        this.insertImageMarkdown(id, file.name.replace(/\.[^.]+$/, ''));
        continue;
      }
      
      // Handle markdown files - ALWAYS ADD (never replace)
      if (ext === 'md' || ext === 'markdown') {
        // If not in project mode, convert to project first
        if (!this.projectState.isProject) {
          this.convertToProject();
        }
        
        // Add to project
        await this.addMarkdownFileToProject(file);
        continue;
      }
      
      // Handle .mdvim/.mdebook files - ALWAYS REPLACE
      if (ext === 'mdvim' || ext === 'mdebook') {
        
        const hasUnsavedChanges = this.modified || (this.projectState.isProject && this.projectState.modifiedFiles.size > 0);
        
        if (hasUnsavedChanges) {
          const result = await this.confirmSaveBeforeAction('プロジェクトを開く前に現在の変更を保存しますか？');
          if (result === 'cancel') continue;
          if (result === 'save') {
            await this.saveFile();
          }
        }
        
        try {
          await this.loadMdvimProject(file);
        } catch (err) {
          console.error('Failed to load project:', err);
          this.fileStatus.textContent = '(load failed)';
        }
        break;
      }
      
      // Handle plain text files - treat as markdown, ALWAYS ADD
      if (ext === 'txt') {
        // If not in project mode, convert to project first
        if (!this.projectState.isProject) {
          this.convertToProject();
        }
        
        // Add to project with .md extension
        try {
          const content = await file.text();
          const mdFileName = file.name.replace(/\.txt$/, '.md');
          
          const id = this.generateUUID();
          const name = mdFileName.replace(/\.md$/, '');
          const maxOrder = Math.max(0, ...Array.from(this.projectState.files.values()).map(f => f.order ?? 0));
          
          const newFile: EditorFile = {
            id,
            path: mdFileName,
            name,
            content,
            modified: true,
            order: maxOrder + 1,
          };
          
          this.projectState.files.set(id, newFile);
          this.projectState.modifiedFiles.add(id);
          
          if (this.projectState.manifest) {
            this.projectState.manifest.files.push({
              id,
              path: mdFileName,
              name,
              order: maxOrder + 1,
            });
          }
          
          this.buildFileTree();
          this.openFileInProject(id);
          this.updateProjectUI();
          
          this.fileStatus.textContent = `(added: ${mdFileName})`;
        } catch (err) {
          console.error('Failed to add file:', err);
          this.fileStatus.textContent = '(add failed)';
        }
        continue;
      }
    }
    this.updatePreview();
  }
  
  /**
   * Adds an external markdown file to the current project
   * @param file - The File object to add
   * @private
   */
  private async addMarkdownFileToProject(file: File): Promise<void> {
    if (!this.projectState.isProject) return;
    
    try {
      const content = await file.text();
      const fileName = file.name;
      const id = this.generateUUID();
      const name = fileName.replace(/\.md$/, '');
      
      // Get max order
      const maxOrder = Math.max(0, ...Array.from(this.projectState.files.values()).map(f => f.order ?? 0));
      
      const newFile: EditorFile = {
        id,
        path: fileName,
        name,
        content,
        modified: true,
        order: maxOrder + 1,
      };
      
      this.projectState.files.set(id, newFile);
      this.projectState.modifiedFiles.add(id);
      
      if (this.projectState.manifest) {
        this.projectState.manifest.files.push({
          id,
          path: fileName,
          name,
          order: maxOrder + 1,
        });
      }
      
      this.buildFileTree();
      this.openFileInProject(id);
      this.updateProjectUI();
      
      this.fileStatus.textContent = `(added: ${fileName})`;
      setTimeout(() => {
        this.fileStatus.textContent = this.projectState.modifiedFiles.size > 0 ? '(modified)' : '';
      }, 2000);
    } catch (err) {
      console.error('Failed to add file to project:', err);
      this.fileStatus.textContent = '(add failed)';
    }
  }

  private async selectAndInsertImage(): Promise<void> {
    
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
      const files = input.files;
      if (!files || files.length === 0) {
        document.body.removeChild(input);
        return;
      }
      
      for (const file of Array.from(files)) {
        const id = await this.addImage(file, file.name);
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

  /**
   * Loads a .mdvim or .mdebook project file
   * Detects format version and delegates to appropriate loader
   * @param filePath - Path to the project file
   * @private
   */
  private async loadMdvim(filePath: string): Promise<void> {
    if (!tauriFs) return;
    
    try {
      const content = await tauriFs.readFile(filePath);
      const zip = await JSZip.loadAsync(content);
      
      // Check for manifest.json to determine format
      const manifestFile = zip.file('manifest.json');
      
      if (manifestFile) {
        // Has manifest - check format
        const manifestText = await manifestFile.async('string');
        const manifest = JSON.parse(manifestText);
        
        // mdebook format: has "chapters" array
        if (manifest.chapters && Array.isArray(manifest.chapters)) {
          await this.loadMdebookFromZip(zip, filePath, manifest);
        } else {
          // mdvim v2 format
          await this.loadMdvimV2FromZip(zip, filePath, manifest);
        }
      } else if (zip.file('content.md')) {
        // Simple mdvim format (content.md + images/)
        await this.loadSimpleMdvimFromZip(zip, filePath);
      } else {
        throw new Error('Unknown file format: no manifest.json or content.md');
      }
      
    } catch (err) {
      console.error('Failed to load file:', err);
      this.fileStatus.textContent = `(load failed: ${err})`;
    }
  }

  private async loadSimpleMdvimFromZip(zip: JSZip, filePath: string): Promise<void> {
    // Simple format: content.md + images/
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
    
    this.projectState.isProject = false;
    this.currentFilePath = filePath;
    this.fileName = filePath.split(/[/\\]/).pop() || 'Untitled';
    this.fileNameEl.textContent = this.fileName;
    this.modified = false;
    this.fileStatus.textContent = '';
    this.updatePreview();
    this.updateLayoutForSingleFile();
  }

  /**
   * Loads a mdvim v2 project from a JSZip instance
   * Parses manifest, loads files and images, sets up project state
   * @param zip - JSZip instance containing the project
   * @param filePath - Path to the source file
   * @param manifest - Parsed project manifest
   * @private
   */
  private async loadMdvimV2FromZip(zip: JSZip, filePath: string, manifest: ProjectManifest): Promise<void> {
    // mdvim v2 project format
    this.projectState.isProject = true;
    this.projectState.projectPath = filePath;
    this.projectState.manifest = manifest;
    this.projectState.files.clear();
    this.projectState.modifiedFiles.clear();
    this.projectState.openTabs = [];
    this.projectState.history = [];
    this.projectState.historyIndex = -1;
    
    // Load files
    for (const fileEntry of manifest.files) {
      const fileInZip = zip.file(fileEntry.path);
      if (fileInZip) {
        const content = await fileInZip.async('string');
        this.projectState.files.set(fileEntry.id, {
          id: fileEntry.id,
          path: fileEntry.path,
          name: fileEntry.name,
          content: content,
          modified: false,
        });
      }
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
        this.images.set(filename, {
          id: filename,
          filename,
          mimeType: this.getMimeType(filename),
          data,
        });
      }
    }
    
    // Set active file
    const firstFile = manifest.files[0];
    if (firstFile) {
      manifest.activeFileId = firstFile.id;
      this.projectState.activeFileId = firstFile.id;
      this.projectState.openTabs.push(firstFile.id);
      
      const file = this.projectState.files.get(firstFile.id);
      if (file) {
        this.editor.setValue(file.content);
        this.fileName = file.name;
      }
    }
    
    this.currentFilePath = filePath;
    this.fileNameEl.textContent = `${manifest.metadata.title || 'Project'} - ${this.fileName}`;
    this.modified = false;
    this.fileStatus.textContent = '';
    this.updatePreview();
    this.updateLayoutForProject(this.projectState.files.size);
    this.buildFileTree();
    this.updateProjectUI();
  }

  // Decode Unicode escaped filenames (e.g., #U8a2d#U8a08#U66f8.md -> 設計書.md)
  private decodeUnicodeFilename(filename: string): string {
    return filename.replace(/#U([0-9a-fA-F]{4})/g, (_match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
  }

  // Encode non-ASCII characters to Unicode escape (e.g., 設計書.md -> #U8a2d#U8a08#U66f8.md)
  private encodeUnicodeFilename(filename: string): string {
    return filename.replace(/[^\x00-\x7F]/g, (char) => {
      return '#U' + char.charCodeAt(0).toString(16).padStart(4, '0');
    });
  }

  /**
   * Loads a mdebook project from a JSZip instance
   * Converts mdebook format to internal project format with Unicode filename support
   * @param zip - JSZip instance containing the project
   * @param filePath - Path to the source file
   * @param mdeManifest - Parsed mdebook manifest
   * @private
   */
  private async loadMdebookFromZip(zip: JSZip, filePath: string, mdeManifest: any): Promise<void> {
    // Convert to mdvim format
    const manifest: ProjectManifest = {
      version: '2.0',
      format: 'mdvim',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      metadata: {
        title: mdeManifest.metadata?.title || 'Imported Project',
        author: mdeManifest.metadata?.author,
        description: mdeManifest.metadata?.description,
        language: mdeManifest.metadata?.language,
      },
      files: [],
      activeFileId: '',
    };
    
    // Initialize project state
    this.projectState.isProject = true;
    this.projectState.projectPath = filePath.replace('.mdebook', '.mdvim');
    this.projectState.files.clear();
    this.projectState.modifiedFiles.clear();
    this.projectState.openTabs = [];
    this.projectState.history = [];
    this.projectState.historyIndex = -1;
    
    // Load files from chapters array in manifest (preserving order)
    const chaptersFolder = zip.folder('chapters');
    
    if (chaptersFolder && mdeManifest.chapters) {
      let order = 0;
      for (const chapterName of mdeManifest.chapters) {
        
        // Try to find the file with Unicode-escaped name
        const escapedName = this.encodeUnicodeFilename(chapterName);
        
        const possiblePaths = [
          `chapters/${chapterName}`,
          `chapters/${escapedName}`,
        ];
        
        let chFile = null;
        for (const path of possiblePaths) {
          chFile = zip.file(path);
          if (chFile) {
            break;
          }
        }
        
        // If not found by exact match, search all md files
        if (!chFile) {
          const allMdFiles = zip.file(/chapters\/.*\.md$/);
          
          for (const f of allMdFiles) {
            const rawName = f.name.split('/').pop() || '';
            const decodedName = this.decodeUnicodeFilename(rawName);
            if (decodedName === chapterName) {
              chFile = f;
              break;
            }
          }
        }
        
        if (chFile) {
          const id = this.generateUUID();
          const content = await chFile.async('string');
          const displayName = chapterName.replace('.md', '');
          const currentOrder = order++;
          
          manifest.files.push({
            id: id,
            path: chapterName,
            name: displayName,
            order: currentOrder,
          });
          
          this.projectState.files.set(id, {
            id: id,
            path: chapterName,
            name: displayName,
            content: content,
            modified: false,
            order: currentOrder,
          });
        } else {
          console.warn(`Chapter file not found: ${chapterName}`);
        }
      }
    }
    
    // Load images
    this.images.clear();
    const imagesFolder = zip.folder('images');
    if (imagesFolder) {
      const imageFiles = imagesFolder.file(/.*/);
      for (const imgFile of imageFiles) {
        if (imgFile.dir) continue;
        const rawFilename = imgFile.name.split('/').pop() || imgFile.name;
        const filename = this.decodeUnicodeFilename(rawFilename);
        const data = await imgFile.async('base64');
        const mimeType = this.guessMimeType(filename);
        this.images.set(filename, {
          id: filename,
          filename: filename,
          mimeType: mimeType,
          data: data,
        });
      }
    }
    
    this.projectState.manifest = manifest;
    
    // Set active file
    const firstFile = manifest.files[0];
    if (firstFile) {
      manifest.activeFileId = firstFile.id;
      this.projectState.activeFileId = firstFile.id;
      this.projectState.openTabs.push(firstFile.id);
      
      const file = this.projectState.files.get(firstFile.id);
      if (file) {
        this.editor.setValue(file.content);
        this.fileName = file.name;
      }
    }
    
    this.currentFilePath = filePath;
    this.fileNameEl.textContent = `${manifest.metadata.title || 'Imported'} - ${this.fileName}`;
    this.modified = false;
    this.fileStatus.textContent = '(imported from mdebook)';
    this.updatePreview();
    this.updateLayoutForProject(this.projectState.files.size);
    this.buildFileTree();
    this.updateProjectUI();
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
    }
    
    if (toRemove.length > 0) {
    }
  }

  // ========== Project Management (Phase 1) ==========

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private async detectFileFormat(file: File): Promise<FileFormat> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
      return 'single-markdown';
    }
    
    if (ext === 'mdvim' || ext === 'mdebook') {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer.slice(0, 4));
      
      // ZIP signature: PK (0x50 0x4B)
      if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
        try {
          const zip = await JSZip.loadAsync(buffer);
          const manifestFile = zip.file('manifest.json');
          if (manifestFile) {
            const manifestText = await manifestFile.async('string');
            const manifest = JSON.parse(manifestText);
            // mdebook format: has "chapters" array
            if (manifest.chapters && Array.isArray(manifest.chapters)) {
              return 'mdebook';
            }
            // mdvim v2 format: has format or version 2.0
            if (manifest.version === '2.0' || manifest.format === 'mdvim') {
              return 'mdvim-v2';
            }
          }
          // ZIP without proper manifest - treat as v2
          return 'mdvim-v2';
        } catch {
          return 'mdvim-v2';
        }
      }
      
      // Not a ZIP - try JSON (legacy mdvim v1)
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.content && data.images) {
          return 'mdvim-v1';
        }
      } catch {
        // Not valid JSON
      }
    }
    
    return 'single-markdown';
  }

  private async loadProject(file: File): Promise<void> {
    const format = await this.detectFileFormat(file);
    
    switch (format) {
      case 'single-markdown':
        await this.loadSingleMarkdown(file);
        break;
      case 'mdvim-v1':
        await this.loadLegacyMdvim(file);
        break;
      case 'mdvim-v2':
        await this.loadMdvimProject(file);
        break;
      case 'mdebook':
        await this.loadMdebookProject(file);
        break;
    }
  }

  private async loadSingleMarkdown(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const content = this.decodeWithAutoDetect(new Uint8Array(buffer));
    
    this.projectState.isProject = false;
    this.projectState.manifest = null;
    this.projectState.files.clear();
    this.projectState.openTabs = [];
    
    this.editor.setValue(content);
    this.fileName = file.name;
    this.fileNameEl.textContent = this.fileName;
    this.modified = false;
    this.fileStatus.textContent = '';
    this.images.clear();
    
    this.updateLayoutForSingleFile();
  }

  private async loadLegacyMdvim(file: File): Promise<void> {
    // Legacy format: { content: string, images: {...} }
    const text = await file.text();
    const data = JSON.parse(text);
    
    this.projectState.isProject = false;
    this.projectState.manifest = null;
    
    this.editor.setValue(data.content || '');
    this.fileName = file.name;
    this.fileNameEl.textContent = this.fileName;
    this.modified = false;
    this.fileStatus.textContent = '';
    
    // Load images
    this.images.clear();
    if (data.images) {
      for (const [id, imageData] of Object.entries(data.images)) {
        const img = imageData as any;
        this.images.set(id, {
          id: id,
          filename: img.filename || id,
          mimeType: img.mimeType || 'image/png',
          data: img.data || '',
        });
      }
    }
    
    this.updatePreview();
    this.updateLayoutForSingleFile();
  }

  private async loadMdvimProject(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    
    // Load manifest
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      throw new Error('Invalid mdvim project: missing manifest.json');
    }
    
    const manifestText = await manifestFile.async('string');
    const manifest: ProjectManifest = JSON.parse(manifestText);
    
    // Initialize project state
    this.projectState.isProject = true;
    this.projectState.projectPath = file.name;
    this.projectState.manifest = manifest;
    this.projectState.files.clear();
    this.projectState.modifiedFiles.clear();
    this.projectState.openTabs = [];
    this.projectState.history = [];
    this.projectState.historyIndex = -1;
    
    // Load files
    for (const fileEntry of manifest.files) {
      const filePath = fileEntry.path;
      const fileObj = zip.file(filePath);
      if (fileObj) {
        const content = await fileObj.async('string');
        this.projectState.files.set(fileEntry.id, {
          id: fileEntry.id,
          path: filePath,
          name: fileEntry.name,
          content: content,
          modified: false,
        });
      }
    }
    
    // Load images
    this.images.clear();
    const imagesFolder = zip.folder('images');
    if (imagesFolder) {
      const imageFiles = imagesFolder.file(/.*/);
      for (const imgFile of imageFiles) {
        const filename = imgFile.name.split('/').pop() || imgFile.name;
        const data = await imgFile.async('base64');
        const mimeType = this.guessMimeType(filename);
        this.images.set(filename, {
          id: filename,
          filename: filename,
          mimeType: mimeType,
          data: data,
        });
      }
    }
    
    // Build file tree
    this.buildFileTree();
    
    // Open active file
    const activeId = manifest.activeFileId || manifest.files[0]?.id;
    if (activeId) {
      this.openFileInProject(activeId);
    }
    
    // Apply layout settings if present
    if (manifest.layout) {
      this.layoutSettings = { ...this.layoutSettings, ...manifest.layout };
    }
    
    this.updateLayoutForProject(this.projectState.files.size);
    this.updateProjectUI();
  }

  private async loadMdebookProject(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    
    // Load manifest
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      throw new Error('Invalid mdebook project: missing manifest.json');
    }
    
    const manifestText = await manifestFile.async('string');
    const mdeManifest = JSON.parse(manifestText);
    
    // Convert to mdvim format
    const manifest: ProjectManifest = {
      version: '2.0',
      format: 'mdvim',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      metadata: {
        title: mdeManifest.metadata?.title || 'Imported Project',
        author: mdeManifest.metadata?.author,
        description: mdeManifest.metadata?.description,
        language: mdeManifest.metadata?.language,
      },
      files: [],
      activeFileId: '',
    };
    
    // Initialize project state
    this.projectState.isProject = true;
    this.projectState.projectPath = file.name.replace('.mdebook', '.mdvim');
    this.projectState.files.clear();
    this.projectState.modifiedFiles.clear();
    this.projectState.openTabs = [];
    this.projectState.history = [];
    this.projectState.historyIndex = -1;
    
    // Load files from chapters array in manifest (preserving order)
    const chaptersFolder = zip.folder('chapters');
    if (chaptersFolder && mdeManifest.chapters) {
      let order = 0;
      for (const chapterName of mdeManifest.chapters) {
        // Try to find the file with Unicode-escaped name
        const escapedName = this.encodeUnicodeFilename(chapterName);
        const possiblePaths = [
          `chapters/${chapterName}`,
          `chapters/${escapedName}`,
        ];
        
        let chFile = null;
        for (const path of possiblePaths) {
          chFile = zip.file(path);
          if (chFile) break;
        }
        
        // If not found by exact match, search with regex
        if (!chFile) {
          const allFiles = chaptersFolder.file(/\.md$/);
          for (const f of allFiles) {
            const decodedName = this.decodeUnicodeFilename(f.name.split('/').pop() || '');
            if (decodedName === chapterName) {
              chFile = f;
              break;
            }
          }
        }
        
        if (chFile) {
          const id = this.generateUUID();
          const content = await chFile.async('string');
          const displayName = chapterName.replace('.md', '');
          const currentOrder = order++;
          
          manifest.files.push({
            id: id,
            path: chapterName,
            name: displayName,
            order: currentOrder,
          });
          
          this.projectState.files.set(id, {
            id: id,
            path: chapterName,
            name: displayName,
            content: content,
            modified: false,
            order: currentOrder,
          });
        } else {
          console.warn(`Chapter file not found: ${chapterName}`);
        }
      }
    }
    
    // Load images
    this.images.clear();
    const imagesFolder = zip.folder('images');
    if (imagesFolder) {
      const imageFiles = imagesFolder.file(/.*/);
      for (const imgFile of imageFiles) {
        if (imgFile.dir) continue;
        const rawFilename = imgFile.name.split('/').pop() || imgFile.name;
        const filename = this.decodeUnicodeFilename(rawFilename);
        const data = await imgFile.async('base64');
        const mimeType = this.guessMimeType(filename);
        this.images.set(filename, {
          id: filename,
          filename: filename,
          mimeType: mimeType,
          data: data,
        });
      }
    }
    
    manifest.activeFileId = manifest.files[0]?.id || '';
    this.projectState.manifest = manifest;
    
    // Build file tree
    this.buildFileTree();
    
    // Open first file
    if (manifest.files.length > 0) {
      this.openFileInProject(manifest.files[0].id);
    }
    
    this.updateLayoutForProject(this.projectState.files.size);
    this.updateProjectUI();
  }

  /**
   * Saves the current project to a .mdvim or .mdebook file
   * Creates ZIP archive with manifest, chapters, and images
   * @private
   */
  private async saveProject(): Promise<void> {
    if (!this.projectState.isProject || !this.projectState.manifest) {
      // Single file save
      await this.saveFile();
      return;
    }
    
    // Update current file content
    if (this.projectState.activeFileId) {
      const currentFile = this.projectState.files.get(this.projectState.activeFileId);
      if (currentFile) {
        currentFile.content = this.editor.getValue();
        currentFile.modified = false;
        this.projectState.modifiedFiles.delete(this.projectState.activeFileId);
      }
    }
    
    // Create ZIP (mdebook compatible format)
    const zip = new JSZip();
    
    // Sort files by order
    const sortedFiles = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    // Create mdebook-compatible manifest
    const manifest = this.projectState.manifest;
    const mdeManifest = {
      version: manifest.version || '2.0',
      metadata: {
        title: manifest.metadata.title,
        author: manifest.metadata.author || '',
        language: manifest.metadata.language || 'ja',
      },
      chapters: sortedFiles.map(f => f.path.endsWith('.md') ? f.path : `${f.path}.md`),
      images: Array.from(this.images.keys()),
    };
    
    zip.file('manifest.json', JSON.stringify(mdeManifest, null, 2));
    
    // Add files to chapters/ folder
    for (const file of sortedFiles) {
      const filename = file.path.endsWith('.md') ? file.path : `${file.path}.md`;
      zip.file(`chapters/${filename}`, file.content);
    }
    
    // Add images
    for (const [id, image] of this.images) {
      zip.file(`images/${id}`, image.data, { base64: true });
    }
    
    // Generate and save
    const content = await zip.generateAsync({ type: 'uint8array' });
    
    if (tauriFs) {
      let filePath = this.projectState.projectPath;
      
      // If no existing path, show save dialog
      if (!filePath && tauriDialog) {
        filePath = await tauriDialog.save({
          defaultPath: 'project.mdvim',
          filters: [
            { name: 'mdvim Project', extensions: ['mdvim'] },
            { name: 'mdebook Project', extensions: ['mdebook'] },
          ],
        });
      }
      
      if (filePath) {
        await tauriFs.writeFile(filePath, content);
        this.projectState.projectPath = filePath;
        
        // Update project title from filename if it's still "New Project"
        const savedFileName = filePath.split(/[/\\]/).pop() || 'project.mdvim';
        if (this.projectState.manifest && this.projectState.manifest.metadata.title === 'New Project') {
          this.projectState.manifest.metadata.title = savedFileName.replace(/\.(mdvim|mdebook)$/, '');
        }
        
        // Update display
        const projectTitle = this.projectState.manifest?.metadata?.title || 'Project';
        const activeFile = this.projectState.activeFileId ? this.projectState.files.get(this.projectState.activeFileId) : null;
        const activeFileName = activeFile?.name || '';
        this.fileNameEl.textContent = activeFileName ? `${projectTitle} - ${activeFileName}` : projectTitle;
        
        // Clear modified flags
        this.projectState.modifiedFiles.clear();
        for (const file of this.projectState.files.values()) {
          file.modified = false;
        }
        
        this.fileStatus.textContent = '(saved)';
        setTimeout(() => {
          this.fileStatus.textContent = '';
        }, 2000);
      }
    } else {
      // Browser download
      const blob = new Blob([new Uint8Array(content)], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.projectState.projectPath || 'project.mdvim';
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Builds the file tree structure from project files
   * Creates a flat list of FileTreeNode sorted by order property
   * @private
   */
  private buildFileTree(): void {
    // Flat file list (no folder hierarchy)
    const files = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    
    const root: FileTreeNode[] = files.map(file => ({
      id: file.id,
      name: file.name,
      path: file.path,
      type: 'file' as const,
    }));
    
    this.projectState.fileTree = root;
  }

  /**
   * Opens a file in the project by its ID
   * Saves current file state, switches editor content, and updates UI
   * @param fileId - The unique identifier of the file to open
   * @private
   */
  private openFileInProject(fileId: string): void {
    // Save current file state
    if (this.projectState.activeFileId) {
      const currentFile = this.projectState.files.get(this.projectState.activeFileId);
      if (currentFile) {
        currentFile.content = this.editor.getValue();
        currentFile.cursorPosition = {
          line: this.editor.getPosition()?.lineNumber || 1,
          column: this.editor.getPosition()?.column || 1,
        };
        currentFile.scrollTop = this.editor.getScrollTop();
      }
    }
    
    // Open new file
    const file = this.projectState.files.get(fileId);
    if (!file) {
      console.error('File not found:', fileId);
      return;
    }
    
    this.projectState.activeFileId = fileId;
    
    // Add to open tabs if not already open
    if (!this.projectState.openTabs.includes(fileId)) {
      this.projectState.openTabs.push(fileId);
    }
    
    // Add to history
    if (this.projectState.history[this.projectState.historyIndex] !== fileId) {
      this.projectState.history = this.projectState.history.slice(0, this.projectState.historyIndex + 1);
      this.projectState.history.push(fileId);
      this.projectState.historyIndex = this.projectState.history.length - 1;
    }
    
    // Load content into editor
    this.editor.setValue(file.content);
    this.fileName = file.name;
    this.fileNameEl.textContent = `${this.projectState.manifest?.metadata.title || 'Project'} - ${file.name}`;
    
    // Restore cursor position
    if (file.cursorPosition) {
      this.editor.setPosition({
        lineNumber: file.cursorPosition.line,
        column: file.cursorPosition.column,
      });
    }
    if (file.scrollTop !== undefined) {
      this.editor.setScrollTop(file.scrollTop);
    }
    
    this.modified = file.modified;
    this.fileStatus.textContent = file.modified ? '(modified)' : '';
    
    this.updatePreview();
    this.updateProjectUI();  // Update both tabs and explorer
  }

  private closeFileInProject(fileId: string): void {
    const index = this.projectState.openTabs.indexOf(fileId);
    if (index === -1) return;
    
    // Check if modified
    const file = this.projectState.files.get(fileId);
    if (file?.modified) {
      if (!confirm(`${file.name} has unsaved changes. Close anyway?`)) {
        return;
      }
    }
    
    // Remove from tabs
    this.projectState.openTabs.splice(index, 1);
    
    // If this was active, switch to another tab
    if (this.projectState.activeFileId === fileId) {
      const newActiveId = this.projectState.openTabs[Math.max(0, index - 1)];
      if (newActiveId) {
        this.openFileInProject(newActiveId);
      } else {
        this.projectState.activeFileId = null;
        this.editor.setValue('');
        this.fileNameEl.textContent = 'No file open';
      }
    }
    
    this.updateTabsUI();
  }

  /**
   * Deletes a file from the project after confirmation
   * Shows confirmation dialog and calls doDeleteFile if confirmed
   * @param fileId - The unique identifier of the file to delete
   * @private
   */
  private deleteFileFromProject(fileId: string): void {
    const file = this.projectState.files.get(fileId);
    if (!file) return;
    
    // Confirm deletion
    if (confirm(`Delete "${file.name}"? This cannot be undone.`)) {
      this.doDeleteFile(fileId);
    }
  }

  private findFileIdByName(name: string): string | null {
    const lowerName = name.toLowerCase();
    for (const [id, file] of this.projectState.files) {
      if (file.name.toLowerCase() === lowerName || 
          file.name.toLowerCase().includes(lowerName) ||
          file.path.toLowerCase().includes(lowerName)) {
        return id;
      }
    }
    return null;
  }

  /**
   * Updates layout for single file mode
   * Hides tabs, preserves explorer visibility
   * @private
   */
  private updateLayoutForSingleFile(): void {
    this.layoutSettings.visibility.tabs = false;
    // Keep explorer visibility unchanged (preserve previous state)
    this.applyLayout();
  }

  /**
   * Updates layout for project mode
   * Shows explorer for multiple files, tabs for single file
   * @param fileCount - Number of files in the project
   * @private
   */
  private updateLayoutForProject(fileCount: number = 1): void {
    if (fileCount > 1) {
      // Multiple files - show explorer, hide tabs
      this.layoutSettings.visibility.tabs = false;
      this.layoutSettings.visibility.explorer = true;
    } else {
      // Single file in project - keep explorer state unchanged
      this.layoutSettings.visibility.tabs = true;
      // Don't change explorer visibility
    }
    this.applyLayout();
  }

  /**
   * Applies the current layout settings to the UI
   * Shows/hides panels and updates CSS classes
   * @private
   */
  private applyLayout(): void {
    const app = document.getElementById('app');
    if (!app) return;
    
    // Set project mode class
    app.classList.toggle('project-mode', this.projectState.isProject);
    
    // Explorer and tabs are mutually exclusive
    // When explorer is shown, hide tabs; when explorer is hidden, show tabs (in project mode)
    const showExplorer = this.layoutSettings.visibility.explorer;
    const showTabs = this.projectState.isProject && !showExplorer;
    
    // Update CSS classes for panel visibility
    app.classList.toggle('show-tabs', showTabs);
    app.classList.toggle('show-explorer', showExplorer);
    app.classList.toggle('show-toc', this.layoutSettings.visibility.toc);
    app.classList.toggle('show-preview', this.layoutSettings.visibility.preview);
    
    // Update panel positions
    app.dataset.tabsPosition = this.layoutSettings.panels.tabs;
    app.dataset.explorerPosition = this.layoutSettings.panels.explorer;
    app.dataset.tocPosition = this.layoutSettings.panels.toc;
    app.dataset.previewPosition = this.layoutSettings.panels.preview;
    
    // Trigger editor relayout
    setTimeout(() => this.editor.layout(), 0);
  }

  private updateProjectUI(): void {
    // Update project/file name display
    if (this.projectState.isProject && this.projectState.manifest) {
      const projectTitle = this.projectState.manifest.metadata.title || 'Project';
      const activeFile = this.projectState.activeFileId ? this.projectState.files.get(this.projectState.activeFileId) : null;
      const activeFileName = activeFile?.name || '';
      this.fileNameEl.textContent = activeFileName ? `${projectTitle} - ${activeFileName}` : projectTitle;
    }
    
    this.updateTabsUI();
    this.updateExplorerUI();
  }

  private updateTabsUI(): void {
    const tabsContainer = document.getElementById('vertical-tabs');
    if (!tabsContainer) return;
    
    const tabList = tabsContainer.querySelector('.tab-list');
    if (!tabList) return;
    
    tabList.innerHTML = '';
    
    // Show ALL files (sorted by order), not just open tabs
    const allFiles = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    for (const file of allFiles) {
      const fileId = file.id;
      const isActive = fileId === this.projectState.activeFileId;
      const isModified = this.projectState.modifiedFiles.has(fileId);
      
      const tab = document.createElement('div');
      tab.className = `tab-item${isActive ? ' active' : ''}${isModified ? ' modified' : ''}`;
      tab.dataset.fileId = fileId;
      tab.title = file.path;
      
      tab.innerHTML = `
        <span class="tab-icon">📄</span>
        <span class="tab-name">${file.name}</span>
      `;
      
      tab.addEventListener('click', () => {
        this.openFileInProject(fileId);
      });
      
      tabList.appendChild(tab);
    }
  }

  private updateExplorerUI(): void {
    const explorerContainer = document.getElementById('file-tree');
    if (!explorerContainer) {
      console.error('file-tree container not found!');
      return;
    }
    
    explorerContainer.innerHTML = '';
    this.renderFileTree(this.projectState.fileTree, explorerContainer);
  }

  /**
   * Renders the file tree in the explorer panel
   * Creates DOM elements for each file with click handlers and mouse-based drag
   * @param nodes - Array of FileTreeNode to render
   * @param container - Parent DOM element to append nodes to
   * @private
   */
  private renderFileTree(nodes: FileTreeNode[], container: HTMLElement): void {
    for (const node of nodes) {
      // Skip folders (flat structure only)
      if (node.type === 'folder') continue;
      
      const nodeId = node.id;
      const nodeName = node.name;
      
      const item = document.createElement('div');
      item.className = 'tree-item file';
      item.dataset.id = nodeId;
      item.dataset.path = node.path;
      
      const isActive = nodeId === this.projectState.activeFileId;
      if (isActive) {
        item.classList.add('active');
      }
      
      // Create name span
      const nameSpan = document.createElement('span');
      nameSpan.className = 'tree-name';
      nameSpan.textContent = nodeName;
      item.appendChild(nameSpan);
      
      // Create delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'tree-delete';
      deleteBtn.title = 'Delete';
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const confirmed = await this.confirmDelete(nodeName);
        if (confirmed) {
          this.doDeleteFile(nodeId);
        }
      });
      item.appendChild(deleteBtn);
      
      // ========== Mouse-based Drag (Tauriのdrag制限を回避) ==========
      let isDragging = false;
      let startY = 0;
      
      item.addEventListener('mousedown', (e) => {
        // 削除ボタンは除外
        if ((e.target as HTMLElement).classList.contains('tree-delete')) return;
        
        isDragging = false;
        startY = e.clientY;
        this.draggingFileId = nodeId;
        
        const onMouseMove = (moveEvent: MouseEvent) => {
          // 5px以上動いたらドラッグ開始
          if (Math.abs(moveEvent.clientY - startY) > 5) {
            isDragging = true;
            item.classList.add('dragging');
            
            // ドロップ先を特定
            const elements = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
            const targetItem = elements.find(el => 
              el.classList.contains('tree-item') && 
              el.classList.contains('file') && 
              el !== item
            ) as HTMLElement | null;
            
            // 他のハイライトをクリア
            container.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
              el.classList.remove('drag-over-top', 'drag-over-bottom');
            });
            
            if (targetItem) {
              const rect = targetItem.getBoundingClientRect();
              const isTop = moveEvent.clientY - rect.top < rect.height / 2;
              targetItem.classList.toggle('drag-over-top', isTop);
              targetItem.classList.toggle('drag-over-bottom', !isTop);
            }
          }
        };
        
        const onMouseUp = (upEvent: MouseEvent) => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          
          item.classList.remove('dragging');
          
          // ハイライトをクリア
          container.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-bottom');
          });
          
          if (isDragging) {
            // ドロップ先を特定
            const elements = document.elementsFromPoint(upEvent.clientX, upEvent.clientY);
            const targetItem = elements.find(el => 
              el.classList.contains('tree-item') && 
              el.classList.contains('file') && 
              el !== item
            ) as HTMLElement | null;
            
            if (targetItem) {
              const targetId = targetItem.dataset.id;
              if (targetId && targetId !== nodeId) {
                const rect = targetItem.getBoundingClientRect();
                const insertBefore = upEvent.clientY - rect.top < rect.height / 2;
                
                this.reorderFile(nodeId, targetId, insertBefore);
              }
            }
          }
          
          this.draggingFileId = null;
          isDragging = false;
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
      
      // ========== Click Events ==========
      let clickTimer: number | null = null;
      
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('tree-delete')) {
          return;
        }
        
        // ドラッグ中はクリックをキャンセル
        if (isDragging) {
          isDragging = false;
          return;
        }
        
        e.stopPropagation();
        
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
          this.startInlineRename(nodeId, nameSpan);
        } else {
          clickTimer = window.setTimeout(() => {
            clickTimer = null;
            this.openFileInProject(nodeId);
          }, 250);
        }
      });
      
      container.appendChild(item);
    }
  }
  
  // Reorder file in project
  /**
   * Reorders a file in the project via drag-and-drop
   * Updates order property for all affected files and refreshes UI
   * @param draggedId - The ID of the file being dragged
   * @param targetId - The ID of the file being dropped onto
   * @param insertBefore - If true, insert before target; otherwise insert after
   * @private
   */
  private reorderFile(draggedId: string, targetId: string, insertBefore: boolean): void {
    const files = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    const draggedFile = this.projectState.files.get(draggedId);
    const targetFile = this.projectState.files.get(targetId);
    if (!draggedFile || !targetFile) return;
    
    // Remove dragged file from array
    const draggedIndex = files.findIndex(f => f.id === draggedId);
    if (draggedIndex !== -1) {
      files.splice(draggedIndex, 1);
    }
    
    // Find target position
    let targetIndex = files.findIndex(f => f.id === targetId);
    if (!insertBefore) {
      targetIndex++;
    }
    
    // Insert at new position
    files.splice(targetIndex, 0, draggedFile);
    
    // Update order for all files
    files.forEach((file, index) => {
      file.order = index;
    });
    
    // Update manifest
    if (this.projectState.manifest) {
      this.projectState.manifest.files = files.map((f, i) => ({
        id: f.id,
        path: f.path,
        name: f.name,
        order: i,
      }));
    }
    
    // Mark as modified
    this.projectState.modifiedFiles.add(draggedId);
    
    // Rebuild UI
    this.buildFileTree();
    this.updateProjectUI();
    
    this.fileStatus.textContent = '(reordered)';
    setTimeout(() => {
      this.fileStatus.textContent = '';
    }, 1500);
  }
  
  /**
   * Moves a file up in the list
   * @param fileId - The ID of the file to move
   * @private
   */
  private moveFileUp(fileId: string): void {
    const files = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    const index = files.findIndex(f => f.id === fileId);
    if (index <= 0) return; // Already at top or not found
    
    // Swap with previous
    const prevFile = files[index - 1];
    const currentFile = files[index];
    
    const tempOrder = prevFile.order ?? 0;
    prevFile.order = currentFile.order ?? 0;
    currentFile.order = tempOrder;
    
    // Update manifest
    this.updateManifestFileOrder();
    
    // Mark as modified
    this.projectState.modifiedFiles.add(fileId);
    
    // Rebuild UI
    this.buildFileTree();
    this.updateProjectUI();
  }
  
  /**
   * Moves a file down in the list
   * @param fileId - The ID of the file to move
   * @private
   */
  private moveFileDown(fileId: string): void {
    const files = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    const index = files.findIndex(f => f.id === fileId);
    if (index < 0 || index >= files.length - 1) return; // Already at bottom or not found
    
    // Swap with next
    const nextFile = files[index + 1];
    const currentFile = files[index];
    
    const tempOrder = nextFile.order ?? 0;
    nextFile.order = currentFile.order ?? 0;
    currentFile.order = tempOrder;
    
    // Update manifest
    this.updateManifestFileOrder();
    
    // Mark as modified
    this.projectState.modifiedFiles.add(fileId);
    
    // Rebuild UI
    this.buildFileTree();
    this.updateProjectUI();
  }
  
  /**
   * Updates the manifest file order from project files
   * @private
   */
  private updateManifestFileOrder(): void {
    if (!this.projectState.manifest) return;
    
    const files = Array.from(this.projectState.files.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    this.projectState.manifest.files = files.map((f, i) => ({
      id: f.id,
      path: f.path,
      name: f.name,
      order: i,
    }));
  }
  
  // Start inline rename in explorer
  /**
   * Starts inline rename mode for a file in the explorer
   * Replaces the name span with an input field for editing
   * @param fileId - The unique identifier of the file to rename
   * @param nameSpan - The span element displaying the file name
   * @private
   */
  private startInlineRename(fileId: string, nameSpan: HTMLSpanElement): void {
    const file = this.projectState.files.get(fileId);
    if (!file) return;
    
    const originalName = file.name;
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-rename-input';
    input.value = originalName;
    
    // Replace span with input
    const parent = nameSpan.parentElement;
    if (!parent) return;
    
    nameSpan.style.display = 'none';
    parent.insertBefore(input, nameSpan);
    
    input.focus();
    input.select();
    
    const finishRename = (save: boolean) => {
      const newName = input.value.trim();
      input.remove();
      nameSpan.style.display = '';
      
      if (save && newName && newName !== originalName) {
        this.renameFileInProject(fileId, newName);
      }
    };
    
    input.addEventListener('blur', () => finishRename(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishRename(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishRename(false);
      }
    });
  }
  
  // Async confirm delete using Tauri dialog or fallback
  /**
   * Shows a confirmation dialog for file deletion
   * Uses Tauri dialog API if available, falls back to native confirm
   * @param fileName - Name of the file to be deleted
   * @returns Promise resolving to true if confirmed, false otherwise
   * @private
   */
  private async confirmDelete(fileName: string): Promise<boolean> {
    // Try to use Tauri's dialog API
    if (tauriDialog && tauriDialog.confirm) {
      try {
        return await tauriDialog.confirm(
          `Delete "${fileName}"? This cannot be undone.`,
          { title: 'Confirm Delete', kind: 'warning' }
        );
      } catch {
        // Fallback to native confirm
      }
    }
    // Fallback to native confirm (synchronous)
    return confirm(`Delete "${fileName}"? This cannot be undone.`);
  }
  
  /**
   * Shows a save confirmation dialog before performing an action
   * @param message - The message to display
   * @returns 'save' | 'discard' | 'cancel'
   * @private
   */
  private async confirmSaveBeforeAction(message: string): Promise<'save' | 'discard' | 'cancel'> {
    // Try to use Tauri's dialog API
    // ask() returns true for OK button, false for Cancel button
    if (tauriDialog && tauriDialog.ask) {
      try {
        // Single dialog: "Save?" with Save/Don't Save buttons
        const wantToSave = await tauriDialog.ask(
          message,
          { 
            title: '未保存の変更', 
            kind: 'warning', 
            okLabel: '保存する', 
            cancelLabel: '保存しない' 
          }
        );
        
        // true = Save, false = Don't save (discard)
        return wantToSave ? 'save' : 'discard';
      } catch {
        // Fallback
      }
    }
    
    // Fallback: use native confirm
    const wantToSave = confirm(message + '\n\n「OK」= 保存して続行\n「キャンセル」= 保存せずに続行');
    return wantToSave ? 'save' : 'discard';
  }
  
  // Actually delete the file (no confirmation)
  /**
   * Actually deletes a file from the project (no confirmation)
   * Removes from files map, manifest, tabs, and updates UI
   * @param fileId - The unique identifier of the file to delete
   * @private
   */
  private doDeleteFile(fileId: string): void {
    const file = this.projectState.files.get(fileId);
    if (!file) return;
    
    const fileName = file.name;
    
    // Remove from files map
    this.projectState.files.delete(fileId);
    this.projectState.modifiedFiles.delete(fileId);
    
    // Remove from manifest
    if (this.projectState.manifest) {
      this.projectState.manifest.files = this.projectState.manifest.files.filter(f => f.id !== fileId);
    }
    
    // Remove from open tabs
    const tabIndex = this.projectState.openTabs.indexOf(fileId);
    if (tabIndex !== -1) {
      this.projectState.openTabs.splice(tabIndex, 1);
    }
    
    // If this was active, switch to another file
    if (this.projectState.activeFileId === fileId) {
      const remainingFiles = Array.from(this.projectState.files.keys());
      if (remainingFiles.length > 0) {
        this.openFileInProject(remainingFiles[0]);
      } else {
        this.projectState.activeFileId = null;
        this.editor.setValue('');
        this.fileNameEl.textContent = 'No files';
      }
    }
    
    // Rebuild file tree and update UI
    this.buildFileTree();
    this.updateProjectUI();
    
    this.fileStatus.textContent = `(deleted: ${fileName})`;
    setTimeout(() => {
      this.fileStatus.textContent = '';
    }, 2000);
  }

  // Rename file in project
  /**
   * Renames a file in the project
   * Updates file name, path, manifest, and refreshes UI
   * @param fileId - The unique identifier of the file to rename
   * @param newName - The new name for the file (with or without .md extension)
   * @private
   */
  private renameFileInProject(fileId: string, newName: string): void {
    const file = this.projectState.files.get(fileId);
    if (!file) return;
    
    const oldName = file.name;
    
    // Ensure proper format
    const displayName = newName.replace(/\.md$/, '');
    const pathName = newName.endsWith('.md') ? newName : `${newName}.md`;
    
    // Update file
    file.name = displayName;
    file.path = pathName;
    file.modified = true;
    this.projectState.modifiedFiles.add(fileId);
    
    // Update manifest
    if (this.projectState.manifest) {
      const manifestFile = this.projectState.manifest.files.find(f => f.id === fileId);
      if (manifestFile) {
        manifestFile.name = displayName;
        manifestFile.path = pathName;
      }
    }
    
    // Update display if this is active file
    if (this.projectState.activeFileId === fileId) {
      this.fileName = displayName;
      this.fileNameEl.textContent = `${this.projectState.manifest?.metadata.title || 'Project'} - ${displayName}`;
    }
    
    // Rebuild file tree and update UI
    this.buildFileTree();
    this.updateProjectUI();
    
    this.fileStatus.textContent = `(renamed: ${oldName} → ${displayName})`;
    setTimeout(() => {
      this.fileStatus.textContent = '';
    }, 2000);
  }

  /**
   * Toggles the explorer panel visibility
   * @public
   */
  public toggleExplorer(): void {
    this.layoutSettings.visibility.explorer = !this.layoutSettings.visibility.explorer;
    this.applyLayout();
  }
  
  // ========== Search Methods ==========
  
  /**
   * Toggles the search panel visibility
   * @private
   */
  private toggleSearchPanel(): void {
    const panel = document.getElementById('search-panel');
    const input = document.getElementById('search-input') as HTMLInputElement;
    
    if (!panel) return;
    
    if (panel.classList.contains('hidden')) {
      // Show panel
      panel.classList.remove('hidden');
      input?.focus();
      // Also show explorer if hidden
      if (!this.layoutSettings.visibility.explorer) {
        this.layoutSettings.visibility.explorer = true;
        this.applyLayout();
      }
    } else {
      // Hide panel
      this.closeSearchPanel();
    }
  }
  
  /**
   * Closes the search panel and clears results
   * @private
   */
  private closeSearchPanel(): void {
    const panel = document.getElementById('search-panel');
    const input = document.getElementById('search-input') as HTMLInputElement;
    const results = document.getElementById('search-results');
    
    panel?.classList.add('hidden');
    if (input) input.value = '';
    if (results) results.innerHTML = '';
    
    // Return focus to editor
    this.editor.focus();
  }
  
  /**
   * Searches for text in all project files
   * @param query - The search query
   * @private
   */
  private searchInProject(query: string): void {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '';
    
    if (!query || query.length < 2) {
      return;
    }
    
    const searchRegex = new RegExp(this.escapeRegex(query), 'gi');
    let totalResults = 0;
    
    // Search in all files
    for (const [fileId, file] of this.projectState.files) {
      const matches: { line: number; text: string; index: number }[] = [];
      // Split and normalize line endings for CRLF compatibility
      const lines = file.content.split('\n').map(l => l.replace(/\r$/, ''));
      
      for (let i = 0; i < lines.length; i++) {
        if (searchRegex.test(lines[i])) {
          matches.push({
            line: i + 1,
            text: lines[i],
            index: i,
          });
          searchRegex.lastIndex = 0; // Reset regex
        }
      }
      
      if (matches.length > 0) {
        totalResults += matches.length;
        
        // Create file header
        const fileHeader = document.createElement('div');
        fileHeader.className = 'search-result-file';
        fileHeader.textContent = `${file.name} (${matches.length})`;
        resultsContainer.appendChild(fileHeader);
        
        // Create result items (limit to first 10 per file)
        for (const match of matches.slice(0, 10)) {
          const item = document.createElement('div');
          item.className = 'search-result-item';
          
          const lineNum = document.createElement('span');
          lineNum.className = 'search-result-line';
          lineNum.textContent = String(match.line);
          
          const text = document.createElement('span');
          text.className = 'search-result-text';
          // Highlight matches
          text.innerHTML = this.highlightMatches(match.text.trim(), query);
          
          item.appendChild(lineNum);
          item.appendChild(text);
          
          // Click to navigate
          item.addEventListener('click', () => {
            this.openFileInProject(fileId);
            // Navigate to line after file is loaded
            setTimeout(() => {
              this.editor.setPosition({ lineNumber: match.line, column: 1 });
              this.editor.revealLineInCenter(match.line);
              this.editor.focus();
            }, 50);
          });
          
          resultsContainer.appendChild(item);
        }
        
        if (matches.length > 10) {
          const more = document.createElement('div');
          more.className = 'search-result-item';
          more.style.color = 'var(--text-secondary)';
          more.textContent = `... and ${matches.length - 10} more`;
          resultsContainer.appendChild(more);
        }
      }
    }
    
    // No results message
    if (totalResults === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'search-no-results';
      noResults.textContent = `No results for "${query}"`;
      resultsContainer.appendChild(noResults);
    }
  }
  
  /**
   * Escapes special regex characters in a string
   * @param str - The string to escape
   * @returns The escaped string
   * @private
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  /**
   * Highlights search matches in text
   * @param text - The text to search in
   * @param query - The search query
   * @returns HTML string with highlighted matches
   * @private
   */
  private highlightMatches(text: string, query: string): string {
    const escaped = this.escapeHtml(text);
    const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }
  
  /**
   * Escapes HTML special characters
   * @param str - The string to escape
   * @returns The escaped string
   * @private
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ========== Project Helper Methods ==========

  /**
   * Creates a new project with default settings
   * Initializes project state, manifest, and first chapter
   * @param title - Optional project title (defaults to 'New Project')
   * @private
   */
  private createNewProject(title?: string): void {
    const projectTitle = title || 'New Project';
    
    this.projectState = {
      isProject: true,
      projectPath: null,
      manifest: {
        version: '2.0',
        format: 'mdvim',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        metadata: {
          title: projectTitle,
        },
        files: [],
        activeFileId: '',
      },
      files: new Map(),
      fileTree: [],
      activeFileId: null,
      openTabs: [],
      modifiedFiles: new Set(),
      history: [],
      historyIndex: -1,
    };
    
    // Create initial file
    this.createNewFileInProject('chapter-1.md');
    
    this.updateLayoutForProject(this.projectState.files.size);
    this.updateProjectUI();
    this.fileStatus.textContent = '(new project)';
  }

  private createNewFileInProject(fileName: string, initialContent: string = ''): void {
    if (!this.projectState.isProject) {
      // Convert current single file to project
      this.convertToProject();
    }
    
    // Ensure .md extension
    const fullName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    const id = this.generateUUID();
    const name = fullName.replace(/\.md$/, '');
    
    // Get max order
    const maxOrder = Math.max(0, ...Array.from(this.projectState.files.values()).map(f => f.order ?? 0));
    
    const file: EditorFile = {
      id,
      path: fullName,
      name,
      content: initialContent,
      modified: initialContent.length > 0,
      order: maxOrder + 1,
    };
    
    this.projectState.files.set(id, file);
    this.projectState.modifiedFiles.add(id);
    
    if (this.projectState.manifest) {
      this.projectState.manifest.files.push({
        id,
        path: fullName,
        name,
        order: maxOrder + 1,
      });
    }
    
    this.buildFileTree();
    this.openFileInProject(id);
    this.updateProjectUI();
  }

  private convertToProject(): void {
    const currentContent = this.editor.getValue();
    const currentName = this.fileName || 'chapter-1.md';
    
    // Ensure .md extension
    const fullName = currentName.endsWith('.md') ? currentName : `${currentName}.md`;
    const id = this.generateUUID();
    const name = fullName.replace(/\.md$/, '');
    
    this.projectState = {
      isProject: true,
      projectPath: null,
      manifest: {
        version: '2.0',
        format: 'mdvim',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        metadata: {
          title: name,
        },
        files: [{
          id,
          path: fullName,
          name,
          order: 0,
        }],
        activeFileId: id,
      },
      files: new Map([[id, {
        id,
        path: fullName,
        name,
        content: currentContent,
        modified: this.modified,
        order: 0,
      }]]),
      fileTree: [],
      activeFileId: id,
      openTabs: [id],
      modifiedFiles: this.modified ? new Set([id]) : new Set(),
      history: [id],
      historyIndex: 0,
    };
    
    this.buildFileTree();
    this.updateLayoutForProject(this.projectState.files.size);
    this.updateProjectUI();
  }

  private async openProjectDialog(): Promise<void> {
    if (tauriDialog) {
      const selected = await tauriDialog.open({
        filters: [
          { name: 'mdvim Project', extensions: ['mdvim', 'mdebook'] },
          { name: 'Markdown', extensions: ['md', 'markdown'] },
        ],
        multiple: false,
      });
      
      if (selected && typeof selected === 'string') {
        // Load via Tauri
        if (tauriFs) {
          const content = await tauriFs.readFile(selected);
          const blob = new Blob([content]);
          const fileName = selected.split(/[/\\]/).pop() || 'project.mdvim';
          const file = new File([blob], fileName);
          await this.loadProject(file);
          this.projectState.projectPath = selected;
        }
      }
    } else {
      // Browser: use file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.mdvim,.mdebook,.md';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (file) {
          await this.loadProject(file);
        }
      };
      input.click();
    }
  }

  private closeProject(): void {
    // Check for unsaved changes
    if (this.projectState.modifiedFiles.size > 0) {
      if (!confirm('There are unsaved changes. Close project anyway?')) {
        return;
      }
    }
    
    this.projectState = {
      isProject: false,
      projectPath: null,
      manifest: null,
      files: new Map(),
      fileTree: [],
      activeFileId: null,
      openTabs: [],
      modifiedFiles: new Set(),
      history: [],
      historyIndex: -1,
    };
    
    this.editor.setValue('');
    this.fileName = 'Untitled';
    this.fileNameEl.textContent = this.fileName;
    this.modified = false;
    this.fileStatus.textContent = '';
    this.images.clear();
    
    this.updateLayoutForSingleFile();
    this.updatePreview();
  }

  private showProjectStatus(): void {
    if (this.projectState.isProject && this.projectState.manifest) {
      const m = this.projectState.manifest;
      const status = `Project: ${m.metadata.title} (${this.projectState.files.size} files)`;
      this.fileStatus.textContent = status;
      setTimeout(() => {
        if (this.fileStatus.textContent === status) {
          this.fileStatus.textContent = '';
        }
      }, 5000);
    } else {
      this.fileStatus.textContent = '(no project open)';
      setTimeout(() => {
        if (this.fileStatus.textContent === '(no project open)') {
          this.fileStatus.textContent = this.modified ? '(modified)' : '';
        }
      }, 3000);
    }
  }

  private nextBuffer(): void {
    if (!this.projectState.isProject || this.projectState.openTabs.length === 0) return;
    
    const currentIndex = this.projectState.openTabs.indexOf(this.projectState.activeFileId || '');
    const nextIndex = (currentIndex + 1) % this.projectState.openTabs.length;
    this.openFileInProject(this.projectState.openTabs[nextIndex]);
  }

  private prevBuffer(): void {
    if (!this.projectState.isProject || this.projectState.openTabs.length === 0) return;
    
    const currentIndex = this.projectState.openTabs.indexOf(this.projectState.activeFileId || '');
    const prevIndex = currentIndex <= 0 ? this.projectState.openTabs.length - 1 : currentIndex - 1;
    this.openFileInProject(this.projectState.openTabs[prevIndex]);
  }

  private switchToBuffer(target: string): void {
    if (!this.projectState.isProject) return;
    
    // Try to find by name or id
    for (const [id, file] of this.projectState.files) {
      if (file.name.includes(target) || file.path.includes(target) || id === target) {
        this.openFileInProject(id);
        return;
      }
    }
    
    this.fileStatus.textContent = `(buffer not found: ${target})`;
  }

  private showBufferList(): void {
    if (!this.projectState.isProject) {
      this.fileStatus.textContent = '(no project open)';
      return;
    }
    
    const buffers: string[] = [];
    let i = 1;
    for (const [id, file] of this.projectState.files) {
      const active = id === this.projectState.activeFileId ? '%' : ' ';
      const modified = this.projectState.modifiedFiles.has(id) ? '+' : ' ';
      buffers.push(`${i}${active}${modified} "${file.name}"`);
      i++;
    }
    
    console.log('Buffers:\n' + buffers.join('\n'));
    this.fileStatus.textContent = `${this.projectState.files.size} buffer(s)`;
  }

  private closeBuffer(target: string): void {
    if (!this.projectState.isProject) return;
    
    // Find buffer by name or id
    for (const [id, file] of this.projectState.files) {
      if (file.name.includes(target) || file.path.includes(target) || id === target) {
        this.closeFileInProject(id);
        return;
      }
    }
  }

  private applyLayoutPreset(preset: string): void {
    switch (preset.toLowerCase()) {
      case 'default':
        this.layoutSettings.panels = { tabs: 'left', explorer: 'left', toc: 'right', preview: 'right' };
        this.layoutSettings.visibility = { tabs: this.projectState.isProject, explorer: false, toc: true, preview: true };
        break;
      case 'obsidian':
        this.layoutSettings.panels = { tabs: 'left', explorer: 'left', toc: 'right', preview: 'right' };
        this.layoutSettings.visibility = { tabs: true, explorer: true, toc: true, preview: true };
        break;
      case 'minimal':
        this.layoutSettings.visibility = { tabs: false, explorer: false, toc: false, preview: true };
        break;
      case 'writer':
        this.layoutSettings.visibility = { tabs: false, explorer: false, toc: true, preview: false };
        this.layoutSettings.panels.toc = 'left';
        break;
      case 'code':
        this.layoutSettings.visibility = { tabs: true, explorer: true, toc: false, preview: false };
        break;
      default:
        this.fileStatus.textContent = `(unknown layout: ${preset})`;
        return;
    }
    
    this.applyLayout();
    this.fileStatus.textContent = `(layout: ${preset})`;
  }

  private showLayoutHelp(): void {
    const help = 'Layouts: default, obsidian, minimal, writer, code';
    this.fileStatus.textContent = help;
    console.log(help);
  }

  private goBackInHistory(): void {
    if (!this.projectState.isProject) return;
    if (this.projectState.historyIndex <= 0) return;
    
    this.projectState.historyIndex--;
    const fileId = this.projectState.history[this.projectState.historyIndex];
    if (fileId) {
      // Save current state without adding to history
      if (this.projectState.activeFileId) {
        const currentFile = this.projectState.files.get(this.projectState.activeFileId);
        if (currentFile) {
          currentFile.content = this.editor.getValue();
        }
      }
      
      // Open file without modifying history
      const file = this.projectState.files.get(fileId);
      if (file) {
        this.projectState.activeFileId = fileId;
        if (!this.projectState.openTabs.includes(fileId)) {
          this.projectState.openTabs.push(fileId);
        }
        this.editor.setValue(file.content);
        this.fileName = file.name;
        this.fileNameEl.textContent = `${this.projectState.manifest?.metadata.title || 'Project'} - ${file.name}`;
        this.updatePreview();
        this.updateTabsUI();
      }
    }
  }

  private goForwardInHistory(): void {
    if (!this.projectState.isProject) return;
    if (this.projectState.historyIndex >= this.projectState.history.length - 1) return;
    
    this.projectState.historyIndex++;
    const fileId = this.projectState.history[this.projectState.historyIndex];
    if (fileId) {
      // Save current state without adding to history
      if (this.projectState.activeFileId) {
        const currentFile = this.projectState.files.get(this.projectState.activeFileId);
        if (currentFile) {
          currentFile.content = this.editor.getValue();
        }
      }
      
      // Open file without modifying history
      const file = this.projectState.files.get(fileId);
      if (file) {
        this.projectState.activeFileId = fileId;
        if (!this.projectState.openTabs.includes(fileId)) {
          this.projectState.openTabs.push(fileId);
        }
        this.editor.setValue(file.content);
        this.fileName = file.name;
        this.fileNameEl.textContent = `${this.projectState.manifest?.metadata.title || 'Project'} - ${file.name}`;
        this.updatePreview();
        this.updateTabsUI();
      }
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
