import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TerminalComponent } from './terminal.component';
import { ApiService } from '../services/api.service';
import { LoggingService } from '../services/logging.service';
import { of, throwError } from 'rxjs';

describe('TerminalComponent', () => {
  let component: TerminalComponent;
  let fixture: ComponentFixture<TerminalComponent>;
  let apiService: jasmine.SpyObj<ApiService>;
  let loggingService: jasmine.SpyObj<LoggingService>;

  beforeEach(async () => {
    const apiServiceSpy = jasmine.createSpyObj('ApiService', [
      'getWorkout',
      'getPlan',
      'getOptions',
      'getCommands'
    ]);
    const loggingServiceSpy = jasmine.createSpyObj('LoggingService', ['logCommand', 'logEvent']);

    await TestBed.configureTestingModule({
      imports: [TerminalComponent],
      providers: [
        { provide: ApiService, useValue: apiServiceSpy },
        { provide: LoggingService, useValue: loggingServiceSpy }
      ]
    }).compileComponents();

    apiService = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
    loggingService = TestBed.inject(LoggingService) as jasmine.SpyObj<LoggingService>;
    fixture = TestBed.createComponent(TerminalComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should preload options on init', () => {
    const mockOptions = {
      bodyParts: ['chest', 'legs'],
      styles: ['strength', 'cardio']
    };
    apiService.getOptions.and.returnValue(of(mockOptions));

    component.ngOnInit();

    expect(component.options).toEqual(mockOptions);
  });

  describe('command parsing and execution', () => {
    it('should handle help command', () => {
      const mockCommands = [
        { command: 'help', description: 'Show help' }
      ];
      apiService.getCommands.and.returnValue(of(mockCommands));
      component.commandInput = 'help';

      component['executeCommand']();

      expect(component.history.length).toBeGreaterThan(0);
      expect(loggingService.logCommand).toHaveBeenCalled();
    });

    it('should handle get-workout command with type', (done) => {
      const mockWorkout = {
        name: 'Push-Ups',
        bodyPart: 'chest',
        style: 'strength'
      };
      apiService.getWorkout.and.returnValue(of(mockWorkout));
      component.commandInput = 'get-workout --type strength';

      component['executeCommand']();

      setTimeout(() => {
        expect(component.history.length).toBeGreaterThan(0);
        expect(apiService.getWorkout).toHaveBeenCalledWith('strength', undefined);
        done();
      }, 50);
    });

    it('should handle plan command', (done) => {
      const mockPlan = [
        { name: 'Squats', bodyPart: 'legs', style: 'strength' }
      ];
      apiService.getPlan.and.returnValue(of(mockPlan));
      component.commandInput = 'plan --type strength';

      component['executeCommand']();

      setTimeout(() => {
        expect(component.history.length).toBeGreaterThan(0);
        expect(apiService.getPlan).toHaveBeenCalledWith('strength', undefined);
        done();
      }, 50);
    });

    it('should handle unknown command', () => {
      component.commandInput = 'unknown-command';

      component['executeCommand']();

      expect(component.errorMessage).toContain('Unknown command');
      expect(component.history.length).toBeGreaterThan(0);
    });
  });

  describe('history navigation', () => {
    it('should navigate history with arrow keys', () => {
      component.history.push({
        command: 'help',
        output: {},
        timestamp: new Date()
      });
      component.historyIndex = -1;

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      spyOn(event, 'preventDefault');
      component.onKeyDown(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.historyIndex).toBe(0);
      expect(component.commandInput).toBe('help');
    });
  });

  describe('formatting and utilities', () => {
    it('should format output as JSON', () => {
      const output = { name: 'Push-Ups', bodyPart: 'chest' };
      const formatted = component.formatOutput(output);

      expect(formatted).toContain('Push-Ups');
      expect(formatted).toContain('chest');
    });

    it('should clear terminal', () => {
      component.history.push({
        command: 'help',
        output: {},
        timestamp: new Date()
      });
      component.commandInput = 'help';
      component.errorMessage = 'test error';

      component.clearTerminal();

      expect(component.history.length).toBe(0);
      expect(component.commandInput).toBe('');
      expect(component.errorMessage).toBe('');
    });
  });

  describe('error handling', () => {
    it('should handle get-workout error', (done) => {
      const error = {
        status: 400,
        error: { error: 'Invalid type', details: 'Type not found' }
      };
      apiService.getWorkout.and.returnValue(throwError(() => error));
      component.commandInput = 'get-workout --type invalid';

      component['executeCommand']();

      setTimeout(() => {
        expect(component.errorMessage).toContain('Request failed. Please try again.');
        expect(component.history.length).toBeGreaterThan(0);
        expect(component.history[component.history.length - 1].output).toEqual({ error: 'Request failed. Please try again.' });
        expect(loggingService.logCommand).toHaveBeenCalledWith(
          jasmine.any(String),
          jasmine.any(Object),
          { error: 'Invalid type', details: 'Type not found' },
          400,
          jasmine.any(Number)
        );
        done();
      }, 50);
    });
  });

  describe('clear command', () => {
    it('should call loggingService.logEvent with CLEAR_TERMINAL when clear is executed', () => {
      component.commandInput = 'clear';

      component['executeCommand']();

      expect(loggingService.logEvent).toHaveBeenCalledWith('CLEAR_TERMINAL', jasmine.any(Object));
    });

    it('should clear history after clear command', () => {
      component.history.push({ command: 'help', output: {}, timestamp: new Date() });
      component.commandInput = 'clear';

      component['executeCommand']();

      expect(component.history.length).toBe(0);
    });
  });

  describe('APP_INIT logging', () => {
    it('should call loggingService.logEvent with APP_INIT and optionsLoaded true on successful getOptions', () => {
      const mockOptions = { bodyParts: ['chest'], styles: ['strength'] };
      apiService.getOptions.and.returnValue(of(mockOptions));

      component.ngOnInit();

      expect(loggingService.logEvent).toHaveBeenCalledWith('APP_INIT', jasmine.objectContaining({ optionsLoaded: true }));
    });

    it('should call loggingService.logEvent with APP_INIT and optionsLoaded false on failing getOptions', () => {
      apiService.getOptions.and.returnValue(throwError(() => new Error('network error')));

      component.ngOnInit();

      expect(loggingService.logEvent).toHaveBeenCalledWith('APP_INIT', jasmine.objectContaining({ optionsLoaded: false }));
    });
  });

  describe('error detail scrubbing', () => {
    it('should not include internal error details in history output', (done) => {
      const error = {
        status: 500,
        error: { error: 'DB failure', details: 'internal DB error' }
      };
      apiService.getWorkout.and.returnValue(throwError(() => error));
      component.commandInput = 'get-workout --type strength';

      component['executeCommand']();

      setTimeout(() => {
        const lastOutput = component.history[component.history.length - 1].output;
        expect(JSON.stringify(lastOutput)).not.toContain('internal DB error');
        done();
      }, 50);
    });

    it('should show generic error message in history output', (done) => {
      const error = {
        status: 500,
        error: { error: 'DB failure', details: 'internal DB error' }
      };
      apiService.getWorkout.and.returnValue(throwError(() => error));
      component.commandInput = 'get-workout --type strength';

      component['executeCommand']();

      setTimeout(() => {
        const lastOutput = component.history[component.history.length - 1].output;
        expect(JSON.stringify(lastOutput)).toContain('Request failed. Please try again.');
        done();
      }, 50);
    });
  });
});
