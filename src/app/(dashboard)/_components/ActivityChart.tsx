"use client";

import { format, parseISO } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ActivityPoint {
  date: string;
  calls: number;
  meetings: number;
  quotes: number;
}

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="gCalls" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gMeetings" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gQuotes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => format(parseISO(v), "d MMM")}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            labelFormatter={(v) => format(parseISO(String(v)), "EEE, d MMM")}
            contentStyle={{
              borderRadius: 8,
              fontSize: 12,
              borderColor: "var(--border)",
            }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
          <Area
            type="monotone"
            dataKey="calls"
            name="Calls"
            stroke="#3B82F6"
            strokeWidth={2}
            fill="url(#gCalls)"
          />
          <Area
            type="monotone"
            dataKey="meetings"
            name="Meetings"
            stroke="#10B981"
            strokeWidth={2}
            fill="url(#gMeetings)"
          />
          <Area
            type="monotone"
            dataKey="quotes"
            name="Quotes"
            stroke="#8B5CF6"
            strokeWidth={2}
            fill="url(#gQuotes)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
