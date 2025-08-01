import chalk from 'chalk';
import logUpdate from 'log-update';
import chalkAnimation from 'chalk-animation';
import { PlaybackStatePayload, RoomStatePayload } from './types';
import * as TokenManager from './tokenManager';

interface Me {
    id: string;
    username: string;
}

const uiState = {
    me: null as Me | null,
    isHost: false,
    mode: 'menu' as 'menu' | 'in-room' | 'help' | 'prompt', // Add prompt state
    room: null as string | null,
    lastPlaybackState: null as PlaybackStatePayload | null,
    roomState: null as RoomStatePayload | null, // Add new state property
    notification: null as string | null,
    notificationTimeout: null as NodeJS.Timeout | null,
    lastRender: 0,
};

const titleAnimation = chalkAnimation.karaoke('ListenAlong', 2);

// A helper for creating hyperlinks in modern terminals
const link = (text: string, url: string) => `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;

function createProgressBar(progress: number, width = 30): string {
  const filled = Math.round(progress * width);
  const empty = width - filled;
  return `[${chalk.green('━'.repeat(filled))}${chalk.gray('━'.repeat(empty))}]`;
}

function formatDuration(ms: number): string {
    if (isNaN(ms) || ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// The main render loop using log-update for flicker-free UI
export function render() {
  // Don't render if in prompt mode
  if (uiState.mode === 'prompt') return;
  
  // Throttle renders to prevent flickering (max 10 renders per second)
  const now = Date.now();
  if (now - uiState.lastRender < 100) return;
  uiState.lastRender = now;
  
  process.stdout.write('\x1B[?25l'); // Hide cursor
  
  let mainContent = '';
  if (uiState.mode === 'menu') mainContent = drawMenu();
  else if (uiState.mode === 'in-room') mainContent = drawInRoomUI();
  else if (uiState.mode === 'help') mainContent = drawHelpScreen();

  const header = `${chalk.bold.magenta('🎵 ListenAlong')} - Welcome, ${chalk.cyan(uiState.me?.username || 'User')}\n`;
  const footer = `\n${chalk.gray('──────────────────────────────────')}\nMade with ${chalk.red('♥')} by ${chalk.cyan('Sarthak')} (x.com/Sarthakhuh)`;
  let notificationLine = '';
  if (uiState.notification) {
      notificationLine = `\n\n${chalk.yellow('⚡')} ${chalk.yellow(uiState.notification)}`;
  }

  const fullContent = `${header}${mainContent}${notificationLine}${footer}`;
  
  // Use logUpdate for flicker-free rendering
  logUpdate(fullContent);
}

function drawMenu(): string {
  let content = `\n${chalk.bold('Main Menu')}\n\n`;
  content += `  ${chalk.cyanBright.bold('[c]')} - Create a new listening room\n`;
  content += `  ${chalk.cyanBright.bold('[j]')} - Join an existing room\n`;
  content += `  ${chalk.cyanBright.bold('[h]')} - Help & Settings\n\n`;
  content += `  ${chalk.cyanBright.bold('[q]')} - Quit\n\n`;
  content += `${chalk.gray('💡 Tip: Make sure Spotify is open and playing music before creating a room!')}`;
  return content;
}

function drawInRoomUI(): string {
  const playbackState = uiState.lastPlaybackState;
  const roomState = uiState.roomState;
  const isHost = roomState?.hostId === uiState.me?.id;

  let content = `${chalk.bold('› In Room:')} ${chalk.greenBright(uiState.room)}\n`;
  
  if (isHost) {
    content += `${chalk.yellow('👑 You are the host')} - Control music with your Spotify app\n\n`;
  } else {
    content += `${chalk.cyan('🎧 Listening along')} - Music will sync automatically\n\n`;
  }

  if (!playbackState || !playbackState.trackName) {
    if (isHost) {
      content += `${chalk.yellow('⏸️  No music playing')} - Start playing music in your Spotify app to begin the session\n`;
    } else {
      content += `${chalk.gray('⏸️  Waiting for host to start music...')}\n`;
    }
  } else {
    const progressPercent = Math.max(0, Math.min(1, playbackState.positionMs / playbackState.durationMs));
    const progressBar = createProgressBar(progressPercent);
    const statusIcon = playbackState.isPlaying ? '▶️' : '⏸️';
    
    content += `  ${statusIcon} ${chalk.bold.white(playbackState.trackName)}\n`;
    content += `     ${chalk.cyan(playbackState.artistName)}\n\n`;
    content += `     ${progressBar} ${formatDuration(playbackState.positionMs)} / ${formatDuration(playbackState.durationMs)}\n`;
  }

  content += `\n${chalk.bold('Members in Room:')} ${roomState?.members?.length || 0}/10\n`;
  if (roomState && roomState.members) {
    roomState.members.forEach(member => {
        const isYou = member.id === uiState.me?.id ? chalk.gray(' (you)') : '';
        if (member.id === roomState.hostId) {
          content += `   ${chalk.yellow('👑')} ${chalk.bold(member.username)} ${chalk.yellow('(Host)')}${isYou}\n`;
        } else {
          content += `   ${chalk.gray('🎧')} ${member.username}${isYou}\n`;
        }
    });
  } else {
    content += `   ${chalk.gray('Loading member list...')}\n`;
  }

  content += `\n${chalk.gray('Press [q] to leave the room')}`;
  return content;
}

function drawHelpScreen(): string {
    const configPath = TokenManager.getConfigPath();
    let content = `${chalk.bold.yellow('⚙️ Help & Settings')}\n\n`;
    content += `Your Spotify authentication tokens are stored at:\n`;
    content += `${chalk.cyan(configPath)}\n\n`;
    content += `If you have issues, you can reset the application by deleting this file.\n\n`;
    content += `  ${chalk.redBright.bold('[r]')} - Reset Configuration (deletes the file)\n`;
    content += `  ${chalk.cyanBright.bold('[b]')} - Back to Main Menu\n`;
    return content;
}

// --- UI State Updaters ---
export function setMe(me: Me) { uiState.me = me; }
export function getMe(): Me | null { return uiState.me; }
export function setIsHost(isHost: boolean) { uiState.isHost = isHost; }
export function setMode(mode: 'menu' | 'in-room' | 'help' | 'prompt') { uiState.mode = mode; }
export function setRoom(roomId: string) { uiState.room = roomId; }
export function getPlaybackState() { return uiState.lastPlaybackState; }
export function setPlaybackState(state: PlaybackStatePayload | null) { uiState.lastPlaybackState = state; }
export function setRoomState(state: RoomStatePayload) { uiState.roomState = state; }

export function showNotification(message: string, duration = 3000) {
    if (uiState.notificationTimeout) clearTimeout(uiState.notificationTimeout);
    uiState.notification = message;
    
    if (duration > 0) {
        uiState.notificationTimeout = setTimeout(() => {
            uiState.notification = null;
            render();
        }, duration);
    }
    
    render();
} 