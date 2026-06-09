import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import Joyride, { type Step, type CallBackProps, STATUS, EVENTS } from 'react-joyride';

// ---------------------------------------------------------------------------
// Tour steps
// ---------------------------------------------------------------------------

const TOUR_STEPS: Step[] = [
  {
    target: 'body',
    placement: 'center',
    title: 'Welcome to ClassPulse!',
    content:
      'Let\u2019s take a quick tour so you know where everything is. This takes about 30 seconds.',
    disableBeacon: true,
  },
  {
    target: '[data-tour="new-analysis"]',
    title: 'Analyze Student Work',
    content:
      'Click here to start a new analysis. Upload photos of student papers or a CSV of scores \u2014 ClassPulse will handle the rest.',
    disableBeacon: true,
  },
  {
    target: '[data-tour="nav-tabs"]',
    title: 'Navigate the App',
    content:
      'Use these tabs to switch between your Dashboard and other sections.',
    disableBeacon: true,
  },
  {
    target: '[data-tour="settings-gear"]',
    title: 'Your Settings',
    content:
      'Update your name, school info, and profile photo here. You can also replay this tour from the Settings page.',
    disableBeacon: true,
  },
];

const STORAGE_KEY = 'classpulse-tour-completed';

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function TourTooltip({
  continuous,
  index,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
}: CallBackProps & {
  continuous: boolean;
  index: number;
  step: Step;
  backProps: Record<string, unknown>;
  primaryProps: Record<string, unknown>;
  skipProps: Record<string, unknown>;
  tooltipProps: Record<string, unknown>;
  isLastStep: boolean;
}) {
  return (
    <div
      {...tooltipProps}
      className="bg-card border border-border rounded-[--radius-lg] shadow-[--shadow-lg] p-5 max-w-xs"
    >
      {step.title && (
        <h3 className="font-heading text-base font-semibold text-foreground mb-1">
          {step.title as string}
        </h3>
      )}
      <p className="text-sm text-muted-foreground leading-relaxed">
        {step.content as string}
      </p>
      <div className="flex items-center justify-between mt-4">
        <button
          {...(skipProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
          className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          Skip tour
        </button>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              {...(backProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
              className="text-xs text-muted-foreground hover:text-foreground font-medium px-3 py-1.5 transition-colors"
            >
              Back
            </button>
          )}
          {continuous && (
            <button
              {...(primaryProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
              className="text-xs bg-primary text-primary-foreground px-4 py-1.5 rounded-full font-medium hover:bg-primary/90 transition-colors"
            >
              {isLastStep ? 'Done' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TourContextValue {
  startTour: () => void;
}

const TourContext = createContext<TourContextValue>({ startTour: () => {} });

export function useTour() {
  return useContext(TourContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [run, setRun] = useState(false);

  // Auto-start for users who haven't completed the tour
  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      const timer = setTimeout(() => setRun(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const startTour = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setRun(true);
  }, []);

  function handleCallback(data: CallBackProps) {
    const { status, type } = data;
    if (
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED ||
      type === EVENTS.TOUR_END
    ) {
      setRun(false);
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  }

  return (
    <TourContext.Provider value={{ startTour }}>
      {children}
      <Joyride
        steps={TOUR_STEPS}
        run={run}
        continuous
        showSkipButton
        disableOverlayClose
        spotlightClicks
        callback={handleCallback}
        tooltipComponent={TourTooltip as never}
        styles={{
          options: {
            zIndex: 10000,
            overlayColor: 'rgba(0, 0, 0, 0.4)',
          },
        }}
      />
    </TourContext.Provider>
  );
}
