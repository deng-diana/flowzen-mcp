-- user_completion_events: 记录每次任务完成事件
CREATE TABLE user_completion_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  task_id uuid NOT NULL,
  completed_at timestamptz DEFAULT now(),
  mood_at_completion text CHECK (mood_at_completion IN ('great', 'okay', 'tired')),
  time_window text,
  was_recommended boolean DEFAULT false
);

-- recommendation_log: 记录每次推荐及用户是否采纳
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

-- user_preferences: 聚合用户习惯（最佳专注时间段、完成总数）
CREATE TABLE user_preferences (
  user_id text PRIMARY KEY,
  best_time_windows jsonb DEFAULT '[]',
  completion_count integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
