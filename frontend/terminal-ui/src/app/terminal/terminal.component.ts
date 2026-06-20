import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Workout, WorkoutOptions } from '../services/api.service';
import { LoggingService } from '../services/logging.service';

interface HistoryItem {
  command: string;
  output: any;
  timestamp: Date;
}

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './terminal.component.html',
  styleUrls: ['./terminal.component.scss']
})
export class TerminalComponent implements OnInit {
  commandInput: string = '';
  history: HistoryItem[] = [];
  historyIndex: number = -1;
  options: WorkoutOptions | null = null;
  isLoading: boolean = false;
  errorMessage: string = '';

  constructor(private apiService: ApiService, private loggingService: LoggingService) {}

  ngOnInit(): void {
    // Preload options
    this.apiService.getOptions().subscribe({
      next: (opts) => {
        this.options = opts;
      },
      error: (err) => {
        console.error('Failed to load options:', err);
      }
    });
  }

  /**
   * Handle Enter key press in the terminal input.
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.executeCommand();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.navigateHistory(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.navigateHistory(1);
    }
  }

  /**
   * Navigate command history with arrow keys.
   */
  private navigateHistory(direction: number): void {
    let newIndex = this.historyIndex + direction;

    if (newIndex < 0) {
      newIndex = this.history.length - 1;
    }

    if (newIndex >= this.history.length) {
      newIndex = -1;
    }

    if (newIndex >= -1 && newIndex < this.history.length) {
      this.historyIndex = newIndex;
      if (newIndex === -1) {
        this.commandInput = '';
      } else {
        this.commandInput = this.history[newIndex].command;
      }
    }
  }

  /**
   * Execute the typed command.
   */
  private executeCommand(): void {
    const trimmed = this.commandInput.trim();
    if (!trimmed) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    const startTime = performance.now();

    this.parseAndExecuteCommand(trimmed, startTime);
  }

  /**
   * Parse and execute the command.
   */
  private parseAndExecuteCommand(trimmed: string, startTime: number): void {
    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const params = this.parseParams(parts.slice(1));

    let output: any = null;
    let status: number = 200;

    if (command === 'help' || command === 'commands') {
      this.handleHelp(params, startTime, command);
    } else if (command === 'get-workout') {
      this.handleGetWorkout(params, startTime, command);
    } else if (command === 'plan') {
      this.handlePlan(params, startTime, command);
    } else if (command === 'options') {
      this.handleOptions(params, startTime, command);
    } else {
      this.errorMessage = `Unknown command: ${command}`;
      this.isLoading = false;
      this.addToHistory(trimmed, { error: this.errorMessage });
      this.loggingService.logCommand(trimmed, params, { error: this.errorMessage }, 400, 0);
    }
  }

  /**
   * Handle 'help' command.
   */
  private handleHelp(params: any, startTime: number, command: string): void {
    this.apiService.getCommands().subscribe({
      next: (commands) => {
        const latency = performance.now() - startTime;
        this.addToHistory(this.commandInput, commands);
        this.loggingService.logCommand(this.commandInput, params, commands, 200, latency);
        this.commandInput = '';
        this.historyIndex = -1;
        this.isLoading = false;
      },
      error: (err) => {
        const latency = performance.now() - startTime;
        const defaultCommands = [
          { command: 'help', description: 'Show available commands' },
          { command: 'get-workout', description: 'Get a random workout', params: '--type (TYPE)' },
          { command: 'plan', description: 'Get a workout plan', params: '--type (TYPE)' },
          { command: 'options', description: 'Show available types and body parts' }
        ];
        this.addToHistory(this.commandInput, defaultCommands);
        this.loggingService.logCommand(this.commandInput, params, defaultCommands, 200, latency);
        this.commandInput = '';
        this.historyIndex = -1;
        this.isLoading = false;
      }
    });
  }

  /**
   * Handle 'get-workout' command.
   */
  private handleGetWorkout(params: any, startTime: number, command: string): void {
    const type = params.type || params.t;
    const bodyPart = params.bodyPart || params.b;

    this.apiService.getWorkout(type, bodyPart).subscribe({
      next: (workout) => {
        const latency = performance.now() - startTime;
        this.addToHistory(this.commandInput, workout);
        this.loggingService.logCommand(this.commandInput, params, workout, 200, latency);
        this.commandInput = '';
        this.historyIndex = -1;
        this.isLoading = false;
      },
      error: (err) => {
        const latency = performance.now() - startTime;
        const errorOutput = {
          error: err.error?.error || 'Failed to fetch workout',
          details: err.error?.details || ''
        };
        this.errorMessage = errorOutput.error;
        this.addToHistory(this.commandInput, errorOutput);
        this.loggingService.logCommand(this.commandInput, params, errorOutput, err.status || 500, latency);
        this.isLoading = false;
      }
    });
  }

  /**
   * Handle 'plan' command.
   */
  private handlePlan(params: any, startTime: number, command: string): void {
    const type = params.type || params.t;
    const bodyPart = params.bodyPart || params.b;

    this.apiService.getPlan(type, bodyPart).subscribe({
      next: (plan) => {
        const latency = performance.now() - startTime;
        this.addToHistory(this.commandInput, plan);
        this.loggingService.logCommand(this.commandInput, params, plan, 200, latency);
        this.commandInput = '';
        this.historyIndex = -1;
        this.isLoading = false;
      },
      error: (err) => {
        const latency = performance.now() - startTime;
        const errorOutput = {
          error: err.error?.error || 'Failed to fetch plan',
          details: err.error?.details || ''
        };
        this.errorMessage = errorOutput.error;
        this.addToHistory(this.commandInput, errorOutput);
        this.loggingService.logCommand(this.commandInput, params, errorOutput, err.status || 500, latency);
        this.isLoading = false;
      }
    });
  }

  /**
   * Handle 'options' command.
   */
  private handleOptions(params: any, startTime: number, command: string): void {
    if (this.options) {
      const latency = performance.now() - startTime;
      this.addToHistory(this.commandInput, this.options);
      this.loggingService.logCommand(this.commandInput, params, this.options, 200, latency);
      this.commandInput = '';
      this.historyIndex = -1;
      this.isLoading = false;
    } else {
      this.apiService.getOptions().subscribe({
        next: (opts) => {
          const latency = performance.now() - startTime;
          this.options = opts;
          this.addToHistory(this.commandInput, opts);
          this.loggingService.logCommand(this.commandInput, params, opts, 200, latency);
          this.commandInput = '';
          this.historyIndex = -1;
          this.isLoading = false;
        },
        error: (err) => {
          const latency = performance.now() - startTime;
          const errorOutput = {
            error: err.error?.error || 'Failed to fetch options',
            details: err.error?.details || ''
          };
          this.errorMessage = errorOutput.error;
          this.addToHistory(this.commandInput, errorOutput);
          this.loggingService.logCommand(this.commandInput, params, errorOutput, err.status || 500, latency);
          this.isLoading = false;
        }
      });
    }
  }

  /**
   * Parse command-line parameters.
   */
  private parseParams(parts: string[]): any {
    const params: any = {};
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('--')) {
        const key = parts[i].substring(2);
        const value = parts[i + 1] && !parts[i + 1].startsWith('--') ? parts[i + 1] : 'true';
        params[key] = value;
        if (key === 'type' && !params['t']) {
          params['t'] = value;
        }
        if (key === 'bodyPart' && !params['b']) {
          params['b'] = value;
        }
      } else if (parts[i].startsWith('-')) {
        const key = parts[i].substring(1);
        const value = parts[i + 1] && !parts[i + 1].startsWith('-') ? parts[i + 1] : 'true';
        params[key] = value;
      }
    }
    return params;
  }

  /**
   * Add command and output to history.
   */
  private addToHistory(command: string, output: any): void {
    this.history.push({
      command,
      output,
      timestamp: new Date()
    });
    // Scroll to bottom
    setTimeout(() => {
      const terminalOutput = document.getElementById('terminal-output');
      if (terminalOutput) {
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
      }
    }, 0);
  }

  /**
   * Copy output to clipboard.
   */
  copyToClipboard(output: any): void {
    const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard');
    });
  }

  /**
   * Clear terminal history.
   */
  clearTerminal(): void {
    this.history = [];
    this.historyIndex = -1;
    this.commandInput = '';
    this.errorMessage = '';
  }

  /**
   * Format output for display.
   */
  formatOutput(output: any): string {
    return JSON.stringify(output, null, 2);
  }
}
