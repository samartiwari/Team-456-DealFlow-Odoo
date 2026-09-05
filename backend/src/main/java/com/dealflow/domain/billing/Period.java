package com.dealflow.domain.billing;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * One billing period, inclusive of both ends.
 *
 * <p>Calendar months, so the length is 28, 29, 30 or 31 and never assumed. The brief's
 * worked examples use a 30-day month for arithmetic that is easy to check by hand; real
 * schedules do not.
 */
public record Period(LocalDate start, LocalDate end) {

    public Period {
        if (start == null || end == null || end.isBefore(start)) {
            throw new IllegalArgumentException("A billing period must end on or after it starts.");
        }
    }

    public int days() {
        return (int) ChronoUnit.DAYS.between(start, end) + 1;
    }

    public boolean covers(LocalDate date) {
        return !date.isBefore(start) && !date.isAfter(end);
    }

    /**
     * Days left after the given date, counting that date as already used.
     *
     * <p>Day 10 of a 30-day period leaves 20, not 21. The day a change takes effect is
     * elapsed -- the customer had the service that day -- and that {@code + 1} is the
     * off-by-one this whole class exists to get right.
     */
    public int remainingDaysFrom(LocalDate date) {
        if (!covers(date)) {
            throw new IllegalArgumentException(
                    date + " is outside the period " + start + " to " + end + ".");
        }
        int elapsed = (int) ChronoUnit.DAYS.between(start, date) + 1;
        return days() - elapsed;
    }
}
