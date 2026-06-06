// Window state management
const windowStates = {};
const taskbarContainer = document.querySelector('.taskbar-windows');
const startMenu = document.getElementById('start-menu');
const startBtn = document.querySelector('.start-btn');

// Make windows draggable
const windows = document.querySelectorAll('.window');
let activeWindow = null;
let offset = { x: 0, y: 0 };
let isResizing = false;
let resizeOffset = { x: 0, y: 0 };

function initWindow(windowEl) {
  const windowId = Math.random().toString(36).substr(2, 9);
  windowEl.dataset.windowId = windowId;
  const titleBar = windowEl.querySelector('.title-bar');
  const titleText = windowEl.querySelector('.title-bar-text').textContent;
  const closeBtn = windowEl.querySelector('.window-buttons .window-btn:nth-child(3)');
  const minBtn = windowEl.querySelector('.window-buttons .window-btn:nth-child(1)');
  const maxBtn = windowEl.querySelector('.window-buttons .window-btn:nth-child(2)');
  const resizer = windowEl.querySelector('.window-resizer');

  // Store window info
  windowStates[windowId] = {
    element: windowEl,
    title: titleText,
    visible: true,
    taskbarBtn: null
  };

  // Dragging
  titleBar.addEventListener('mousedown', (e) => {
    // Don't drag if clicking a button
    if (e.target.classList.contains('window-btn')) return;
    
    activeWindow = windowEl;
    windows.forEach(w => w.classList.remove('active'));
    windowEl.classList.add('active');
    
    offset.x = e.clientX - windowEl.offsetLeft;
    offset.y = e.clientY - windowEl.offsetTop;

    const onMouseMove = (moveEvent) => {
      windowEl.style.left = (moveEvent.clientX - offset.x) + 'px';
      windowEl.style.top = (moveEvent.clientY - offset.y) + 'px';
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Resizing
  if (resizer) {
    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      // Bring window to front when resizing
      windows.forEach(w => w.classList.remove('active'));
      windowEl.classList.add('active');
      
      resizeOffset.x = e.clientX;
      resizeOffset.y = e.clientY;
      const originalWidth = windowEl.offsetWidth;
      const originalHeight = windowEl.offsetHeight;

      const onMouseMove = (moveEvent) => {
        const newWidth = originalWidth + (moveEvent.clientX - resizeOffset.x);
        const newHeight = originalHeight + (moveEvent.clientY - resizeOffset.y);
        
        if (newWidth > 250) windowEl.style.width = newWidth + 'px';
        if (newHeight > 100) windowEl.style.height = newHeight + 'px';
      };

      const onMouseUp = () => {
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault(); // Prevent text selection during resize
    });
  }

  // Minimize button
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    windowEl.style.display = 'none';
    windowStates[windowId].visible = false;
    addTaskbarButton(windowId);
  });

  // Maximize button
  maxBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const desktop = document.querySelector('.desktop');
    if (windowEl.style.width === '100%' && windowEl.style.height === '100%') {
      // Restore to original size
      windowEl.style.width = '';
      windowEl.style.height = '';
      windowEl.style.top = '';
      windowEl.style.left = '';
    } else {
      // Maximize
      windowEl.style.width = '100%';
      windowEl.style.height = '100%';
      windowEl.style.top = '0';
      windowEl.style.left = '0';
    }
  });

  // Close button
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    windowEl.style.display = 'none';
    windowStates[windowId].visible = false;
    removeTaskbarButton(windowId);
  });
}

function addTaskbarButton(windowId) {
  const windowState = windowStates[windowId];
  if (windowState.taskbarBtn) return;

  const btn = document.createElement('button');
  btn.className = 'taskbar-window-btn';
  btn.textContent = windowState.title;
  btn.addEventListener('click', () => {
    restoreWindow(windowId);
  });

  taskbarContainer.appendChild(btn);
  windowState.taskbarBtn = btn;
}

function removeTaskbarButton(windowId) {
  const windowState = windowStates[windowId];
  if (windowState.taskbarBtn) {
    windowState.taskbarBtn.remove();
    windowState.taskbarBtn = null;
  }
}

function restoreWindow(windowId) {
  const windowState = windowStates[windowId];
  windowState.element.style.display = 'flex';
  windowState.visible = true;
  windowState.element.classList.add('active');
  removeTaskbarButton(windowId);
  startMenu.classList.remove('active');
}

// Build Start Menu
function buildStartMenu() {
  startMenu.innerHTML = '';
  
  // Add all available windows
  Object.keys(windowStates).forEach(windowId => {
    const windowState = windowStates[windowId];
    const item = document.createElement('div');
    item.className = 'start-menu-item';
    item.textContent = windowState.title;
    item.addEventListener('click', () => {
      restoreWindow(windowId);
    });
    startMenu.appendChild(item);
  });

  // Add separator
  const separator = document.createElement('div');
  separator.className = 'start-menu-separator';
  startMenu.appendChild(separator);

  // Add Shutdown option
  const shutdownItem = document.createElement('div');
  shutdownItem.className = 'start-menu-item';
  shutdownItem.textContent = 'Shut Down...';
  shutdownItem.addEventListener('click', () => {
    alert('Thanks for visiting my portfolio!\n\nMake sure to check out all the windows!');
    startMenu.classList.remove('active');
  });
  startMenu.appendChild(shutdownItem);
}

// Start button menu
startBtn.addEventListener('click', () => {
  buildStartMenu();
  startMenu.classList.toggle('active');
});

// Close menu when clicking elsewhere
document.addEventListener('click', (e) => {
  if (e.target !== startBtn && !startMenu.contains(e.target)) {
    startMenu.classList.remove('active');
  }
});

// Initialize all windows
windows.forEach(windowEl => {
  initWindow(windowEl);
});

// Desktop Icon interactions - consolidated
const iconHandlers = {
  'my-pc-icon': () => toggleWindow('My Computer'),
  'file-explorer-icon': () => toggleWindow('File Explorer'),
  'notepad-icon': () => toggleWindow('Notepad'),
  'folder-icon': () => alert('My Folder is empty.'),
  'recycle-icon': () => alert('Recycle Bin is empty.\n\nDrag files here to delete them.')
};

function toggleWindow(windowTitle) {
  let found = false;
  Object.keys(windowStates).forEach(windowId => {
    if (windowStates[windowId].title.includes(windowTitle)) {
      found = true;
      if (windowStates[windowId].element.style.display === 'none') {
        restoreWindow(windowId);
      } else {
        windowStates[windowId].element.classList.add('active');
      }
    }
  });
  return found;
}

// Setup icon handlers
Object.entries(iconHandlers).forEach(([iconId, handler]) => {
  const icon = document.getElementById(iconId);
  if (icon) {
    icon.addEventListener('click', () => {
      document.querySelectorAll('.icon').forEach(i => i.classList.remove('selected'));
      icon.classList.add('selected');
    });

    icon.addEventListener('dblclick', handler);
  }
});

// Notepad functionality
const notepadTextarea = document.getElementById('notepad-textarea');
if (notepadTextarea) {
  // Load from localStorage
  const savedContent = localStorage.getItem('notepad-content');
  if (savedContent) {
    notepadTextarea.value = savedContent;
  }

  // Save on input
  notepadTextarea.addEventListener('input', () => {
    localStorage.setItem('notepad-content', notepadTextarea.value);
  });
}

// File Explorer items - cached and optimized
function setupFileItemHandlers() {
  const fileItems = document.querySelectorAll('.file-item');
  fileItems.forEach(item => {
    // Remove old listeners by cloning
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);
    
    newItem.addEventListener('click', function() {
      fileItems.forEach(i => {
        i.style.background = '';
        i.style.color = '';
      });
      this.style.background = '#000080';
      this.style.color = '#ffffff';
    });
  });
}

setupFileItemHandlers();

// Properties button - Show System Properties
const propertiesBtn = document.getElementById('properties-btn');
if (propertiesBtn) {
  propertiesBtn.addEventListener('click', () => {
    alert('System Properties\n\n' +
      'Computer Name: Anton\'s Portfolio\n' +
      'OS: Windows 98 Theme\n' +
      'Processor: Awesome Idea™ 5000\n' +
      'RAM: ∞ GB (Unlimited Potential)\n' +
      'Storage: Cloud-based (The Internet)\n' +
      'Status: Optimized & Running at 100%\n\n' +
      'Last Updated: June 2026\n' +
      'Uptime: ∞ (Always Online)');
  });
}

// View All Projects button - Expand project list
const viewAllBtn = document.getElementById('view-all-projects-btn');
if (viewAllBtn) {
  let isExpanded = false;
  viewAllBtn.addEventListener('click', () => {
    const projectsList = document.getElementById('projects-list');
    if (!isExpanded) {
      projectsList.innerHTML = `
        <strong>Featured Projects:</strong><br>
        • Windows 98 Portfolio<br>
        • E-Commerce Platform<br>
        • Real-time Analytics Dashboard<br>
        • Mobile Weather App<br>
        • Content Management System<br>
        • API Framework<br>
        • DevOps Pipeline Automation<br><br>
        <em>Click to collapse</em>
      `;
      viewAllBtn.textContent = 'Collapse';
      isExpanded = true;
    } else {
      projectsList.innerHTML = '<strong>This Portfolio</strong><br>A Windows 98-themed personal site.';
      viewAllBtn.textContent = 'View All';
      isExpanded = false;
    }
  });
}

// File Explorer Menu functionality
const explorerMenus = {
  'explorer-file-menu': {
    'Open': () => alert('Open dialog would appear here'),
    'New Folder': () => alert('Creating new folder...'),
    '-': null,
    'Properties': () => alert('Selected item properties'),
    'Close': () => {
      Object.keys(windowStates).forEach(windowId => {
        if (windowStates[windowId].title.includes('File Explorer')) {
          windowStates[windowId].element.style.display = 'none';
          windowStates[windowId].visible = false;
          removeTaskbarButton(windowId);
        }
      });
    }
  },
  'explorer-edit-menu': {
    'Copy': () => alert('Copy selected items'),
    'Cut': () => alert('Cut selected items'),
    'Paste': () => alert('Paste items'),
    '-': null,
    'Select All': () => alert('Selected all items'),
    'Deselect All': () => alert('Deselected all items')
  },
  'explorer-view-menu': {
    'Details': () => alert('Switching to Details view'),
    'List': () => alert('Switching to List view'),
    'Icons': () => alert('Switching to Icon view'),
    '-': null,
    'Refresh': () => alert('Refreshing folder contents'),
    'Arrange Icons': () => alert('Arrange icons by name')
  },
  'explorer-help-menu': {
    'View Help': () => alert('Help: This is the File Explorer window.\n\nYou can browse files and folders here.\n\nDouble-click items to open them.'),
    'About': () => alert('File Explorer - Windows 98 Theme Edition\nVersion 1.0\n\nPortfolio File Management System')
  }
};

Object.entries(explorerMenus).forEach(([menuId, items]) => {
  const menuItem = document.getElementById(menuId);
  if (menuItem) {
    menuItem.addEventListener('click', () => {
      const dropdownId = menuId.replace('explorer-', '') + '-dropdown';
      const dropdownId2 = menuId.replace('menu', 'menu-dropdown');
      let actualDropdownId = dropdownId;
      
      // Find the right dropdown
      if (document.getElementById(dropdownId2)) {
        actualDropdownId = dropdownId2;
      } else if (menuId.includes('file')) {
        actualDropdownId = 'file-menu-dropdown';
      } else if (menuId.includes('edit')) {
        actualDropdownId = 'edit-menu-dropdown';
      } else if (menuId.includes('view')) {
        actualDropdownId = 'view-menu-dropdown';
      } else if (menuId.includes('help')) {
        actualDropdownId = 'help-menu-dropdown';
      }

      // Create or get dropdown
      let dropdown = document.getElementById(actualDropdownId);
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = actualDropdownId;
        dropdown.className = 'dropdown-menu';
        menuItem.parentElement.appendChild(dropdown);
      }

      // Clear previous items
      dropdown.innerHTML = '';

      // Add menu items
      Object.entries(items).forEach(([label, action]) => {
        if (label === '-') {
          const sep = document.createElement('div');
          sep.className = 'dropdown-separator';
          dropdown.appendChild(sep);
        } else {
          const item = document.createElement('div');
          item.className = 'dropdown-item';
          item.textContent = label;
          if (action) {
            item.addEventListener('click', () => {
              action();
              dropdown.classList.remove('active');
            });
          }
          dropdown.appendChild(item);
        }
      });

      dropdown.classList.toggle('active');
    });
  }
});

// Send Email button
const sendEmailBtn = document.getElementById('send-email-btn');
if (sendEmailBtn) {
  sendEmailBtn.addEventListener('click', () => {
    window.location.href = 'mailto:anton@lovgren.dev';
  });
}

// Close dropdown when clicking elsewhere
document.addEventListener('click', (e) => {
  if (!e.target.classList.contains('menu-item') && !e.target.classList.contains('dropdown-item')) {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('active'));
  }
});

// ============================================================
// NEW FEATURES (1-13)
// ============================================================

// FEATURE 1-2: SYSTEM TRAY & ENHANCED CLOCK
const timeDisplay = document.getElementById('time-display');
const hoverInfo = document.getElementById('hover-info');

// Initialize time display
timeDisplay.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

// Update time and stats
setInterval(() => {
  const now = new Date();
  timeDisplay.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  
  // Update hover info with simulated stats
  const cpuUsage = Math.floor(Math.random() * 40) + 10;
  const ramUsage = Math.floor(Math.random() * 35) + 20;
  const uptime = Math.floor(Date.now() / 1000 / 3600) + ' hours';
  
  hoverInfo.innerHTML = `
    <strong>System Info</strong><br>
    Date: ${now.toLocaleDateString()}<br>
    Time: ${now.toLocaleTimeString()}<br>
    CPU: ${cpuUsage}%<br>
    RAM: ${ramUsage}%<br>
    Uptime: ${uptime}
  `;
}, 1000);

// Show system info on clock hover
timeDisplay.addEventListener('mouseenter', () => {
  hoverInfo.classList.add('active');
});

timeDisplay.addEventListener('mouseleave', () => {
  hoverInfo.classList.remove('active');
});

// System Tray icons functionality
const volumeIcon = document.getElementById('volume-icon');
const networkIcon = document.getElementById('network-icon');
const batteryIcon = document.getElementById('battery-icon');

if (volumeIcon) {
  volumeIcon.addEventListener('click', () => {
    createNotification('🔊 Volume Control', 'Current: 75%');
  });
}

if (networkIcon) {
  networkIcon.addEventListener('click', () => {
    createNotification('📶 Network Status', 'Connected - Excellent signal');
  });
}

if (batteryIcon) {
  batteryIcon.addEventListener('click', () => {
    createNotification('🔋 Battery Status', 'AC Power - 100%');
  });
}

// Notification system
function createNotification(title, message) {
  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.innerHTML = `<strong>${title}</strong><br>${message}`;
  document.body.appendChild(notif);
  
  setTimeout(() => {
    notif.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// FEATURE 3: QUICK LAUNCH TOOLBAR
const qlCalc = document.getElementById('ql-calc');
const qlNotepad = document.getElementById('ql-notepad');
const qlExplorer = document.getElementById('ql-explorer');
const qlCmd = document.getElementById('ql-cmd');

if (qlCalc) qlCalc.addEventListener('click', () => toggleWindow('Calculator'));
if (qlNotepad) qlNotepad.addEventListener('click', () => toggleWindow('Notepad'));
if (qlExplorer) qlExplorer.addEventListener('click', () => toggleWindow('File Explorer'));
if (qlCmd) qlCmd.addEventListener('click', () => toggleWindow('Command Prompt'));

// FEATURE 5: CALCULATOR
const calcDisplay = document.getElementById('calc-display');
let calcValue = '0';
let calcOperator = null;
let calcPrevValue = null;
let calcShouldReset = false;

if (calcDisplay) {
  calcDisplay.value = '0';
}

document.querySelectorAll('.calc-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!calcDisplay) return;
    
    const val = btn.dataset.val;
    const op = btn.dataset.op;
    
    if (val) {
      // Prevent multiple decimal points
      if (val === '.' && calcValue.includes('.')) {
        return;
      }
      
      if (calcShouldReset) {
        calcValue = val === '.' ? '0.' : val;
        calcShouldReset = false;
      } else {
        calcValue = calcValue === '0' && val !== '.' ? val : calcValue + val;
      }
    }
    
    if (op) {
      if (op === '=') {
        if (calcOperator && calcPrevValue !== null) {
          const prev = parseFloat(calcPrevValue);
          const curr = parseFloat(calcValue);
          let result = 0;
          
          switch(calcOperator) {
            case '+': result = prev + curr; break;
            case '-': result = prev - curr; break;
            case '*': result = prev * curr; break;
            case '/': result = prev / curr; break;
          }
          
          calcValue = result.toString();
          calcOperator = null;
          calcPrevValue = null;
        }
      } else {
        if (calcOperator && calcPrevValue !== null) {
          const prev = parseFloat(calcPrevValue);
          const curr = parseFloat(calcValue);
          let result = 0;
          
          switch(calcOperator) {
            case '+': result = prev + curr; break;
            case '-': result = prev - curr; break;
            case '*': result = prev * curr; break;
            case '/': result = prev / curr; break;
          }
          
          calcValue = result.toString();
        } else {
          calcPrevValue = calcValue;
        }
        
        calcOperator = op;
        calcShouldReset = true;
      }
    }
    
    calcDisplay.value = calcValue;
  });
});

const calcClearBtn = document.querySelector('.calc-clear');
if (calcClearBtn) {
  calcClearBtn.addEventListener('click', () => {
    calcValue = '0';
    calcOperator = null;
    calcPrevValue = null;
    calcShouldReset = false;
    if (calcDisplay) calcDisplay.value = '0';
  });
}

// FEATURE 6: COMMAND PROMPT
const cmdInput = document.getElementById('cmd-input');
const cmdOutput = document.getElementById('cmd-output');

const commands = {
  'help': 'Available commands: help, dir, echo, whoami, date, calc, weather, portfolio, easter\n',
  'dir': 'Volume in drive C has no label.\n Directory of C:\\\n[.]\n[..]\n Portfolio (DIR)\n README.md (1.2 KB)\n',
  'echo': (args) => args + '\n',
  'whoami': 'Portfolio\\Anton\n',
  'date': () => new Date().toString() + '\n',
  'calc': 'Starting Calculator...\n',
  'weather': '🌤️  Current Weather: Sunny, 72°F\n',
  'portfolio': 'This is my awesome Windows 98 themed portfolio!\n',
  'easter': '🎮 You found an easter egg! Congratulations!\n',
  'clear': () => {
    if (cmdOutput) cmdOutput.innerHTML = '';
    return '';
  }
};

if (cmdInput) {
  cmdInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const input = cmdInput.value.trim();
    cmdInput.value = '';
    
    cmdOutput.innerHTML += `<div>C:\\&gt; ${input}</div>`;
    
    if (input) {
      const [cmd, ...args] = input.split(' ');
      const output = commands[cmd.toLowerCase()];
      
      if (output) {
        if (typeof output === 'function') {
          cmdOutput.innerHTML += `<div>${output(args.join(' '))}</div>`;
        } else {
          cmdOutput.innerHTML += `<div>${output}</div>`;
        }
      } else {
        cmdOutput.innerHTML += `<div>'${cmd}' is not recognized as an internal or external command.</div>`;
      }
    }
    
    cmdOutput.parentElement.scrollTop = cmdOutput.parentElement.scrollHeight;
  }
  });
}

// FEATURE 7: MINESWEEPER GAME
class Minesweeper {
  constructor(rows = 8, cols = 10, mines = 10) {
    this.rows = rows;
    this.cols = cols;
    this.mines = mines;
    this.board = [];
    this.revealed = [];
    this.gameOver = false;
    this.won = false;
    this.init();
  }
  
  init() {
    this.board = Array(this.rows * this.cols).fill(0);
    this.revealed = Array(this.rows * this.cols).fill(false);
    
    // Place mines
    let placed = 0;
    while (placed < this.mines) {
      const idx = Math.floor(Math.random() * (this.rows * this.cols));
      if (this.board[idx] !== 'M') {
        this.board[idx] = 'M';
        placed++;
      }
    }
    
    // Calculate numbers
    for (let i = 0; i < this.rows * this.cols; i++) {
      if (this.board[i] !== 'M') {
        let count = 0;
        const neighbors = this.getNeighbors(i);
        neighbors.forEach(n => {
          if (this.board[n] === 'M') count++;
        });
        this.board[i] = count > 0 ? count : 0;
      }
    }
    
    this.gameOver = false;
    this.won = false;
  }
  
  getNeighbors(idx) {
    const row = Math.floor(idx / this.cols);
    const col = idx % this.cols;
    const neighbors = [];
    
    for (let r = -1; r <= 1; r++) {
      for (let c = -1; c <= 1; c++) {
        if (r === 0 && c === 0) continue;
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          neighbors.push(nr * this.cols + nc);
        }
      }
    }
    return neighbors;
  }
  
  reveal(idx) {
    if (this.gameOver || this.won || this.revealed[idx]) return;
    
    this.revealed[idx] = true;
    
    if (this.board[idx] === 'M') {
      this.gameOver = true;
      createNotification('Game Over', '💥 You hit a mine!');
      return;
    }
    
    if (this.board[idx] === 0) {
      this.getNeighbors(idx).forEach(n => {
        if (!this.revealed[n]) this.reveal(n);
      });
    }
    
    if (this.checkWin()) {
      this.won = true;
      updateSkills(50); // Add XP for winning
      createNotification('You Won! 🎉', 'Great job! +50 XP');
    }
  }
  
  checkWin() {
    for (let i = 0; i < this.board.length; i++) {
      if (this.board[i] !== 'M' && !this.revealed[i]) {
        return false;
      }
    }
    return true;
  }
}

let game = new Minesweeper(8, 10, 10);
let mineGameStartTime = null;
let mineGameTimer = null;

function startMinesweeperTimer() {
  if (mineGameTimer) clearInterval(mineGameTimer);
  mineGameStartTime = Date.now();
  mineGameTimer = setInterval(() => {
    if (!game.gameOver && !game.won) {
      const elapsed = Math.floor((Date.now() - mineGameStartTime) / 1000);
      document.getElementById('mine-time').textContent = elapsed;
    } else {
      clearInterval(mineGameTimer);
    }
  }, 1000);
}

function renderMinesweeper() {
  const board = document.getElementById('minesweeper-board');
  board.innerHTML = '';
  
  // Start timer on first reveal
  if (!mineGameStartTime && board.children.length === 0) {
    startMinesweeperTimer();
  }
  
  for (let i = 0; i < game.rows * game.cols; i++) {
    const cell = document.createElement('div');
    cell.className = 'mine-cell';
    
    if (game.revealed[i]) {
      cell.classList.add('revealed');
      if (game.board[i] === 'M') {
        cell.textContent = '💣';
        if (game.gameOver) cell.classList.add('mine-hit');
      } else if (game.board[i] > 0) {
        cell.textContent = game.board[i];
      }
    } else {
      cell.textContent = '▢';
    }
    
    cell.addEventListener('click', () => {
      game.reveal(i);
      renderMinesweeper();
    });
    
    board.appendChild(cell);
  }
}

const newGameBtn = document.getElementById('new-game-btn');
if (newGameBtn) {
  newGameBtn.addEventListener('click', () => {
    if (mineGameTimer) clearInterval(mineGameTimer);
    mineGameTimer = null;
    mineGameStartTime = null;
    game = new Minesweeper(8, 10, 10);
    document.getElementById('mine-count').textContent = 10;
    document.getElementById('mine-time').textContent = 0;
    renderMinesweeper();
  });
}

renderMinesweeper();

// FEATURE 4: TASK MANAGER
function updateTaskManager() {
  const taskList = document.getElementById('task-list');
  taskList.innerHTML = '';
  
  Object.values(windowStates).forEach(windowState => {
    const item = document.createElement('div');
    item.className = 'task-item';
    item.textContent = windowState.title;
    
    if (windowState.visible && windowState.element.style.display !== 'none') {
      item.textContent += ' (Running)';
      item.style.color = '#008000';
    }
    
    item.addEventListener('click', () => {
      document.querySelectorAll('.task-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      item.dataset.windowId = Object.keys(windowStates).find(id => windowStates[id] === windowState);
    });
    
    taskList.appendChild(item);
  });
}

// End Task button functionality
const endTaskBtn = document.getElementById('end-task-btn');
if (endTaskBtn) {
  endTaskBtn.addEventListener('click', () => {
    const selectedTask = document.querySelector('.task-item.selected');
    if (selectedTask && selectedTask.dataset.windowId) {
      const windowId = selectedTask.dataset.windowId;
      const windowState = windowStates[windowId];
      windowState.element.style.display = 'none';
      windowState.visible = false;
      addTaskbarButton(windowId);
      updateTaskManager();
    }
  });
}

// Update task manager when windows change
window.addEventListener('mouseup', updateTaskManager);
window.addEventListener('click', updateTaskManager);
window.addEventListener('dblclick', updateTaskManager);

// FEATURE 8: CONTEXT MENU
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.window') || e.target.closest('.icon')) return;
  
  e.preventDefault();
  const contextMenu = document.getElementById('context-menu');
  contextMenu.innerHTML = `
    <div class="context-item">New Folder</div>
    <div class="context-item">New Shortcut</div>
    <div class="context-separator"></div>
    <div class="context-item">Paste</div>
    <div class="context-separator"></div>
    <div class="context-item">Refresh</div>
    <div class="context-item">Properties</div>
  `;
  
  contextMenu.classList.add('active');
  contextMenu.style.left = e.clientX + 'px';
  contextMenu.style.top = e.clientY + 'px';
});

document.addEventListener('click', () => {
  document.getElementById('context-menu').classList.remove('active');
});

// FEATURE 11: THEME SYSTEM
document.querySelectorAll('[data-theme]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.body.className = '';
    if (e.target.dataset.theme !== 'blue') {
      document.body.classList.add('theme-' + e.target.dataset.theme);
    }
    localStorage.setItem('theme', e.target.dataset.theme);
    createNotification('Theme Changed', `Switched to ${e.target.dataset.theme} theme`);
  });
});

// Load saved theme
const savedTheme = localStorage.getItem('theme');
if (savedTheme && savedTheme !== 'blue') {
  document.body.classList.add('theme-' + savedTheme);
}

// FEATURE 10: SKILLS & EXPERIENCE SYSTEM
let playerStats = {
  level: 1,
  xp: 0,
  skills: {
    'HTML/CSS': 0,
    'JavaScript': 0,
    'React': 0,
    'Backend': 0,
    'DevOps': 0
  }
};

// Load stats from localStorage
const savedStats = localStorage.getItem('playerStats');
if (savedStats) {
  playerStats = JSON.parse(savedStats);
}

function updateSkills(xpGain = 10) {
  playerStats.xp += xpGain;
  
  // Level up every 100 XP
  if (playerStats.xp >= 100) {
    playerStats.level++;
    playerStats.xp = 0;
    createNotification('Level Up! ⭐', `You reached level ${playerStats.level}`);
  }
  
  localStorage.setItem('playerStats', JSON.stringify(playerStats));
  updateSkillsDisplay();
}

function updateSkillsDisplay() {
  document.getElementById('total-xp').textContent = playerStats.xp;
  document.getElementById('level').textContent = playerStats.level;
  
  const skillsList = document.getElementById('skills-list');
  skillsList.innerHTML = '';
  
  Object.entries(playerStats.skills).forEach(([skill, level]) => {
    const bar = document.createElement('div');
    bar.className = 'skill-bar';
    const skillLevel = Math.min(level + playerStats.level * 10, 100);
    bar.innerHTML = `
      <div class="skill-label">
        <span>${skill}</span>
        <span>${skillLevel}%</span>
      </div>
      <div class="skill-progress">
        <div class="skill-fill" style="width: ${skillLevel}%"></div>
      </div>
    `;
    skillsList.appendChild(bar);
  });
}

updateSkillsDisplay();

// Add XP on various actions
document.addEventListener('dblclick', () => {
  if (Math.random() < 0.1) {
    updateSkills(5);
  }
});

// FEATURE 9: RESUME DOWNLOAD
const resumeBtn = document.getElementById('resume-btn');
if (resumeBtn) {
  resumeBtn.addEventListener('click', () => {
  // Create a simple PDF-like download (in real world, this would be a real PDF)
  const resumeContent = `ANTON LOVGREN - PORTFOLIO
  
  Windows 98 Theme Portfolio
  An interactive, retro-styled personal website featuring:
  - Draggable, resizable windows
  - Fully functional calculator
  - Minesweeper game
  - Command prompt simulator
  - Task manager
  - And much more!
  
  Skills:
  • Web Development (HTML, CSS, JavaScript)
  • UI/UX Design
  • Full Stack Development
  • DevOps & Automation
  
  Projects:
  1. Windows 98 Portfolio (You're viewing it!)
  2. E-Commerce Platform
  3. Real-time Analytics Dashboard
  4. Mobile Weather App
  
  Contact: anton@lovgren.dev
  GitHub: github.com/antonlovg
  LinkedIn: linkedin.com/in/anton`;
  
  const blob = new Blob([resumeContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Anton_Lovgren_Resume.txt';
  a.click();
  updateSkills(25);
  createNotification('Resume Downloaded', 'Successfully downloaded! +25 XP');
  });
}

// Add new icons to icon handlers
const newIconHandlers = {
  'task-manager-icon': () => toggleWindow('Task Manager'),
  'calculator-icon': () => toggleWindow('Calculator'),
  'cmd-icon': () => toggleWindow('Command Prompt'),
  'minesweeper-icon': () => toggleWindow('Minesweeper'),
  'skills-icon': () => toggleWindow('Skills & Experience')
};

Object.entries(newIconHandlers).forEach(([iconId, handler]) => {
  const icon = document.getElementById(iconId);
  if (icon) {
    icon.addEventListener('click', () => {
      document.querySelectorAll('.icon').forEach(i => i.classList.remove('selected'));
      icon.classList.add('selected');
    });
    icon.addEventListener('dblclick', handler);
  }
});
