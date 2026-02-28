-- user_completion_events: records each task completion event
CREATE TABLE user_completion_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  task_id uuid NOT NULL,
  completed_at timestamptz DEFAULT now(),
  mood_at_completion text CHECK (mood_at_completion IN ('great', 'okay', 'tired')),
  time_window text,
  was_recommended boolean DEFAULT false
);

-- recommendation_log: records each recommendation and whether the user accepted it
CREATE TABLE recommendation_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  recommended_task_id uuid,
  recommended_at timestamptz DEFAULT now(),
  mood text,
  time_window text,
  reason_text text,
  was_accepted boolean,
  accepted_at timestamptz
);

-- user_preferences: aggregates user habits (best focus window, total completions)
CREATE TABLE user_preferences (
  user_id text PRIMARY KEY,
  best_time_windows jsonb DEFAULT '[]',
  completion_count integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
