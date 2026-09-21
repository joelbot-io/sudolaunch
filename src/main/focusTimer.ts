import { ipcMain, BrowserWindow } from 'electron'
import type { FocusTimerState } from '../shared/types'
import { addNotification } from './notifications'

let timerInterval: NodeJS.Timeout | null = null
let running = false
let paused = false
let durationMinutes = 25
let remainingSeconds = 25 * 60
let sessionCount = 0

function broadcastState(): void {
  const state = getFocusTimerState()
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('focus-timer-tick', state)
    }
  })
}

export function getFocusTimerState(): FocusTimerState {
  return {
    running,
    paused,
    durationMinutes,
    remainingSeconds,
    sessionCount
  }
}

export function startFocusTimer(minutes?: number): FocusTimerState {
  if (minutes !== undefined && minutes > 0) {
    durationMinutes = minutes
    remainingSeconds = minutes * 60
  } else if (remainingSeconds <= 0) {
    remainingSeconds = durationMinutes * 60
  }

  running = true
  paused = false

  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }

  timerInterval = setInterval(() => {
    if (!running || paused) return

    remainingSeconds = Math.max(0, remainingSeconds - 1)
    broadcastState()

    if (remainingSeconds === 0) {
      if (timerInterval) {
        clearInterval(timerInterval)
        timerInterval = null
      }
      running = false
      paused = false
      sessionCount++

      addNotification({
        title: 'Focus Session Complete! 🎯',
        body: `Great job! You finished a ${durationMinutes}-minute focus block (session #${sessionCount}). Take a break!`,
        type: 'success',
        commandName: 'focus'
      })

      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('focus-timer-complete', sessionCount)
        }
      })
      broadcastState()
    }
  }, 1000)

  broadcastState()
  return getFocusTimerState()
}

export function pauseFocusTimer(): FocusTimerState {
  if (running) {
    paused = !paused
    broadcastState()
  }
  return getFocusTimerState()
}

export function resetFocusTimer(minutes?: number): FocusTimerState {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
  running = false
  paused = false
  if (minutes !== undefined && minutes > 0) {
    durationMinutes = minutes
  }
  remainingSeconds = durationMinutes * 60
  broadcastState()
  return getFocusTimerState()
}

export function registerFocusTimerIpc(): void {
  ipcMain.handle('focus-timer-get', () => getFocusTimerState())
  ipcMain.handle('focus-timer-start', (_event, mins?: number) => startFocusTimer(mins))
  ipcMain.handle('focus-timer-pause', () => pauseFocusTimer())
  ipcMain.handle('focus-timer-reset', (_event, mins?: number) => resetFocusTimer(mins))
}
