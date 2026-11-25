
/* =========================================================
   MNM LEGAL ASSOCIATES
   HEARING CALENDAR — CLOUD ENGINE
   Version 1.0

   Justice, Integrity & Excellence

   Existing Firebase Case Management Integration
   ========================================================= */

import { auth } from "./firebase-config.js";

import {
    verifyStaffAccess
} from "./auth.js";

import {
    fetchCases,
    fetchCaseClients,
    getCase,
    updateCaseHearing
} from "./cases-cloud.js";


/* =========================================================
   01. CALENDAR CONFIGURATION
   ========================================================= */

export const CALENDAR_CONFIG = Object.freeze({

    version: "1.0",

    firmName: "MNM Legal Associates",

    timeZone: "Asia/Kolkata",

    defaultView: "month",

    defaultUpcomingDays: 30,

    maximumRangeDays: 366,

    refreshInterval: 60000,

    allowedRoles: ["admin"],

    weekStartsOn: 1

});


export const CALENDAR_VIEWS = Object.freeze({

    month: "Monthly Calendar",

    week: "Weekly Calendar",

    day: "Daily Schedule",

    upcoming: "Upcoming Hearings",

    overdue: "Overdue Hearings",

    deadlines: "Limitation & Deadlines"

});


export const EVENT_TYPES = Object.freeze({

    hearing: "Court Hearing",

    deadline: "Limitation Deadline"

});


export const EVENT_COLORS = Object.freeze({

    hearing: "#315d91",

    deadline: "#b38b42",

    urgent: "#b91c1c",

    overdue: "#dc2626",

    high: "#b45309",

    normal: "#315d91"

});


const EXCLUDED_STATUSES = Object.freeze([

    "disposed",

    "settled",

    "withdrawn",

    "closed",

    "archived"

]);


/* =========================================================
   02. ADMINISTRATOR AUTHORIZATION
   ========================================================= */

async function requireAdministrator() {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user?.uid) {

        throw new Error(
            "Authentication required. Please sign in."
        );

    }

    const profile = await verifyStaffAccess(user);

    if (

        !profile ||

        profile.active !== true ||

        profile.role !== "admin" ||

        auth.currentUser?.uid !== user.uid

    ) {

        throw new Error(
            "Administrator access is required."
        );

    }

    return {

        uid: user.uid,

        name: profile.name || "Administrator",

        role: profile.role

    };

}


function assertSession(uid) {

    if (!uid || auth.currentUser?.uid !== uid) {

        throw new Error(
            "Your authentication session has changed."
        );

    }

}


/* =========================================================
   03. INDIAN DATE AND TIME UTILITIES
   ========================================================= */

export function getIndianDate(date = new Date()) {

    if (

        !(date instanceof Date) ||

        Number.isNaN(date.getTime())

    ) {

        throw new Error("Invalid date.");

    }

    const parts = new Intl.DateTimeFormat("en-GB", {

        timeZone: CALENDAR_CONFIG.timeZone,

        year: "numeric",

        month: "2-digit",

        day: "2-digit"

    }).formatToParts(date);

    const values = Object.fromEntries(

        parts.map(part => [

            part.type,

            part.value

        ])

    );

    return `${values.year}-${values.month}-${values.day}`;

}


export function getIndianDateTime() {

    return new Intl.DateTimeFormat("en-IN", {

        timeZone: CALENDAR_CONFIG.timeZone,

        dateStyle: "medium",

        timeStyle: "short"

    }).format(new Date());

}


export function isValidCalendarDate(value) {

    if (

        typeof value !== "string" ||

        !/^\d{4}-\d{2}-\d{2}$/.test(value)

    ) {

        return false;

    }

    const date = new Date(`${value}T00:00:00Z`);

    if (Number.isNaN(date.getTime())) {

        return false;

    }

    return date.toISOString().slice(0, 10) === value;

}


export function parseCalendarDate(value) {

    if (!isValidCalendarDate(value)) {

        throw new Error("Invalid calendar date.");

    }

    return new Date(`${value}T00:00:00Z`);

}


export function addCalendarDays(value, days) {

    if (!Number.isSafeInteger(days)) {

        throw new Error("Invalid number of days.");

    }

    const date = parseCalendarDate(value);

    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);

}


export function getDaysDifference(from, to) {

    const first = parseCalendarDate(from);

    const second = parseCalendarDate(to);

    return Math.round(

        (second.getTime() - first.getTime()) /

        86400000

    );

}


export function formatCalendarDate(

    value,

    options = {}

) {

    if (!value) return "Not scheduled";

    const date = parseCalendarDate(value);

    return new Intl.DateTimeFormat("en-IN", {

        day: "2-digit",

        month: "short",

        year: "numeric",

        ...options,

        timeZone: "UTC"

    }).format(date);

}


export function formatCalendarMonth(value) {

    const date = parseCalendarDate(value);

    return new Intl.DateTimeFormat("en-IN", {

        month: "long",

        year: "numeric",

        timeZone: "UTC"

    }).format(date);

}


/* =========================================================
   04. MONTHLY AND WEEKLY DATE RANGES
   ========================================================= */

export function getMonthRange(

    value = getIndianDate()

) {

    const date = parseCalendarDate(value);

    const year = date.getUTCFullYear();

    const month = date.getUTCMonth();

    const start = new Date(date);

    start.setUTCDate(1);

    const end = new Date(start);

    end.setUTCMonth(month + 1, 0);

    return {

        year,

        month: month + 1,

        startDate: start.toISOString().slice(0, 10),

        endDate: end.toISOString().slice(0, 10),

        daysInMonth: end.getUTCDate()

    };

}


export function getWeekRange(

    value = getIndianDate()

) {

    const date = parseCalendarDate(value);

    const weekday = date.getUTCDay();

    const offset = (weekday + 6) % 7;

    const startDate = addCalendarDays(

        value,

        -offset

    );

    return {

        startDate,

        endDate: addCalendarDays(startDate, 6)

    };

}


export function shiftCalendarMonth(

    value,

    amount

) {

    if (!Number.isSafeInteger(amount)) {

        throw new Error("Invalid month adjustment.");

    }

    const date = parseCalendarDate(value);

    const originalDay = date.getUTCDate();

    date.setUTCDate(1);

    date.setUTCMonth(

        date.getUTCMonth() + amount

    );

    const lastDay = new Date(date);

    lastDay.setUTCMonth(

        lastDay.getUTCMonth() + 1,

        0

    );

    date.setUTCDate(

        Math.min(

            originalDay,

            lastDay.getUTCDate()

        )

    );

    return date.toISOString().slice(0, 10);

}


/* =========================================================
   05. CALENDAR GRID GENERATOR
   ========================================================= */

export function generateMonthGrid(

    value = getIndianDate()

) {

    const range = getMonthRange(value);

    const firstDay = parseCalendarDate(

        range.startDate

    );

    const offset = (

        firstDay.getUTCDay() + 6

    ) % 7;

    const gridStart = addCalendarDays(

        range.startDate,

        -offset

    );

    const today = getIndianDate();

    const cells = [];

    // Fixed six-week calendar layout.

    for (let index = 0; index < 42; index++) {

        const date = addCalendarDays(

            gridStart,

            index

        );

        const parsed = parseCalendarDate(date);

        cells.push({

            date,

            day: parsed.getUTCDate(),

            weekday: parsed.getUTCDay(),

            currentMonth:

                date.slice(0, 7) ===

                range.startDate.slice(0, 7),

            isToday: date === today,

            isPast: date < today,

            isWeekend:

                parsed.getUTCDay() === 0 ||

                parsed.getUTCDay() === 6

        });

    }

    return cells;

}


export function generateWeekGrid(

    value = getIndianDate()

) {

    const range = getWeekRange(value);

    const today = getIndianDate();

    return Array.from({

        length: 7

    }, (_, index) => {

        const date = addCalendarDays(

            range.startDate,

            index

        );

        const parsed = parseCalendarDate(date);

        return {

            date,

            day: parsed.getUTCDate(),

            weekday: parsed.getUTCDay(),

            isToday: date === today,

            isPast: date < today

        };

    });

}


/* =========================================================
   06. CASE ELIGIBILITY
   ========================================================= */

export function isCalendarEligibleCase(record) {

    return Boolean(

        record &&

        record.id &&

        !EXCLUDED_STATUSES.includes(record.status)

    );

}


/* =========================================================
   07. EVENT CLASSIFICATION
   ========================================================= */

export function getEventTiming(

    date,

    today = getIndianDate()

) {

    const days = getDaysDifference(today, date);

    return {

        daysRemaining: days,

        isOverdue: days < 0,

        isToday: days === 0,

        isUpcoming: days > 0

    };

}


export function getEventColor(event) {

    if (event.isOverdue) {

        return EVENT_COLORS.overdue;

    }

    if (event.priority === "urgent") {

        return EVENT_COLORS.urgent;

    }

    if (event.type === "deadline") {

        return EVENT_COLORS.deadline;

    }

    if (event.priority === "high") {

        return EVENT_COLORS.high;

    }

    return EVENT_COLORS.hearing;

}


/* =========================================================
   08. CONVERT CASES INTO CALENDAR EVENTS

   No duplicate Firestore records are created.
   Events are derived from existing case documents.
   ========================================================= */

export function buildCalendarEvents(

    records = [],

    clients = [],

    today = getIndianDate()

) {

    if (!isValidCalendarDate(today)) {

        throw new Error("Invalid reference date.");

    }

    const clientMap = new Map(

        clients.map(client => [

            client.id,

            client

        ])

    );

    const events = [];

    for (const record of records) {

        if (!isCalendarEligibleCase(record)) {

            continue;

        }

        const client = clientMap.get(

            record.clientId

        );

        const base = {

            caseId: record.id,

            caseCode: record.caseCode || "",

            caseTitle: record.caseTitle || "",

            clientId: record.clientId || "",

            clientName: client?.fullName || "",

            clientCode: client?.clientCode || "",

            clientCapacity: record.clientCapacity || "",

            matterType: record.matterType || "",

            practiceArea: record.practiceArea || "",

            courtName: record.courtName || "",

            courtCity: record.courtCity || "",

            courtNumber: record.courtNumber || "",

            caseNumber: record.caseNumber || "",

            cnrNumber: record.cnrNumber || "",

            presidingJudge: record.presidingJudge || "",

            assignedAdvocate:

                record.assignedAdvocate || "",

            priority: record.priority || "normal",

            status: record.status || "",

            currentStage: record.currentStage || "",

            revision: record.revision

        };


        // Court hearing event.

        if (

            record.matterType === "litigation" &&

            isValidCalendarDate(record.nextHearingDate)

        ) {

            const event = {

                ...base,

                id: `${record.id}:hearing`,

                type: "hearing",

                date: record.nextHearingDate,

                title: record.caseTitle || "Court Hearing",

                purpose:

                    record.nextHearingPurpose ||

                    "Purpose not specified",

                ...getEventTiming(

                    record.nextHearingDate,

                    today

                )

            };

            event.color = getEventColor(event);

            events.push(event);

        }


        // Limitation or filing deadline.

        if (

            isValidCalendarDate(record.limitationDate)

        ) {

            const event = {

                ...base,

                id: `${record.id}:deadline`,

                type: "deadline",

                date: record.limitationDate,

                title: record.caseTitle || "Legal Deadline",

                purpose: "Recorded limitation deadline",

                ...getEventTiming(

                    record.limitationDate,

                    today

                )

            };

            event.color = getEventColor(event);

            events.push(event);

        }

    }

    return sortCalendarEvents(events);

}


/* =========================================================
   09. EVENT SORTING
   ========================================================= */

export function sortCalendarEvents(events = []) {

    const priorityOrder = {

        urgent: 0,

        high: 1,

        normal: 2

    };

    return [...events].sort((a, b) =>

        a.date.localeCompare(b.date)

        ||

        (

            (priorityOrder[a.priority] ?? 3) -

            (priorityOrder[b.priority] ?? 3)

        )

        ||

        String(a.courtName || "").localeCompare(

            String(b.courtName || "")

        )

        ||

        String(a.caseTitle || "").localeCompare(

            String(b.caseTitle || "")

        )

        ||

        a.id.localeCompare(b.id)

    );

}


/* =========================================================
   10. CENTRALIZED CALENDAR DATA
   ========================================================= */

export async function fetchCalendarData() {

    const administrator =

        await requireAdministrator();

    const [records, clients] = await Promise.all([

        fetchCases({

            includeArchived: false

        }),

        fetchCaseClients({

            includeArchived: true

        })

    ]);

    assertSession(administrator.uid);

    const today = getIndianDate();

    const events = buildCalendarEvents(

        records,

        clients,

        today

    );

    const statistics = calculateCalendarStatistics(

        events,

        today

    );

    return {

        events,

        statistics,

        filters: getCalendarFilterOptions(events),

        eligibleCaseCount:

            records.filter(isCalendarEligibleCase).length,

        today,

        synchronizedAt: new Date().toISOString(),

        administrator: administrator.name

    };

}


/* =========================================================
   11. FILTER OPTIONS
   ========================================================= */

export function getCalendarFilterOptions(events = []) {

    const uniqueValues = field =>

        [...new Set(

            events

                .map(event => event[field])

                .filter(Boolean)

        )].sort((a, b) => a.localeCompare(b));

    return {

        courts: uniqueValues("courtName"),

        cities: uniqueValues("courtCity"),

        advocates: uniqueValues("assignedAdvocate"),

        practiceAreas: uniqueValues("practiceArea"),

        priorities: [

            "normal",

            "high",

            "urgent"

        ],

        eventTypes: [

            "hearing",

            "deadline"

        ]

    };

}


/* =========================================================
   12. ADVANCED EVENT FILTERING
   ========================================================= */

export function filterCalendarEvents(

    events = [],

    filters = {}

) {

    const search = String(

        filters.search || ""

    ).trim().toLowerCase();

    const startDate = filters.startDate || "";

    const endDate = filters.endDate || "";

    if (

        (startDate && !isValidCalendarDate(startDate)) ||

        (endDate && !isValidCalendarDate(endDate)) ||

        (startDate && endDate && startDate > endDate)

    ) {

        throw new Error("Invalid calendar filter range.");

    }

    const result = events.filter(event => {

        if (

            startDate &&

            event.date < startDate

        ) return false;

        if (

            endDate &&

            event.date > endDate

        ) return false;

        if (

            filters.type &&

            filters.type !== "all" &&

            event.type !== filters.type

        ) return false;

        if (

            filters.court &&

            filters.court !== "all" &&

            event.courtName !== filters.court

        ) return false;

        if (

            filters.city &&

            filters.city !== "all" &&

            event.courtCity !== filters.city

        ) return false;

        if (

            filters.advocate &&

            filters.advocate !== "all" &&

            event.assignedAdvocate !== filters.advocate

        ) return false;

        if (

            filters.priority &&

            filters.priority !== "all" &&

            event.priority !== filters.priority

        ) return false;

        if (

            filters.practiceArea &&

            filters.practiceArea !== "all" &&

            event.practiceArea !== filters.practiceArea

        ) return false;

        if (

            filters.caseId &&

            event.caseId !== filters.caseId

        ) return false;

        if (

            filters.overdueOnly &&

            !event.isOverdue

        ) return false;

        if (search) {

            const searchable = [

                event.caseCode,

                event.caseTitle,

                event.caseNumber,

                event.cnrNumber,

                event.clientName,

                event.clientCode,

                event.courtName,

                event.courtCity,

                event.assignedAdvocate,

                event.purpose,

                event.currentStage

            ].join(" ").toLowerCase();

            if (!searchable.includes(search)) {

                return false;

            }

        }

        return true;

    });

    return sortCalendarEvents(result);

}


/* =========================================================
   13. GROUP EVENTS BY DATE
   ========================================================= */

export function groupEventsByDate(events = []) {

    const grouped = new Map();

    for (const event of sortCalendarEvents(events)) {

        if (!grouped.has(event.date)) {

            grouped.set(event.date, []);

        }

        grouped.get(event.date).push(event);

    }

    return grouped;

}


export function getEventsForDate(

    events = [],

    date = getIndianDate()

) {

    if (!isValidCalendarDate(date)) {

        throw new Error("Invalid selected date.");

    }

    return sortCalendarEvents(

        events.filter(event => event.date === date)

    );

}


/* =========================================================
   14. UPCOMING HEARINGS
   ========================================================= */

export function getUpcomingHearings(

    events = [],

    days = 30,

    today = getIndianDate()

) {

    if (

        !Number.isSafeInteger(days) ||

        days < 1 ||

        days > CALENDAR_CONFIG.maximumRangeDays

    ) {

        throw new Error("Invalid upcoming hearing range.");

    }

    const endDate = addCalendarDays(

        today,

        days - 1

    );

    return filterCalendarEvents(events, {

        type: "hearing",

        startDate: today,

        endDate

    });

}


/* =========================================================
   15. OVERDUE HEARINGS
   ========================================================= */

export function getOverdueHearings(

    events = [],

    today = getIndianDate()

) {

    return sortCalendarEvents(

        events.filter(event =>

            event.type === "hearing" &&

            event.date < today

        )

    );

}


/* =========================================================
   16. LIMITATION DEADLINE TRACKER
   ========================================================= */

export function getUpcomingDeadlines(

    events = [],

    days = 30,

    includeOverdue = true,

    today = getIndianDate()

) {

    if (

        !Number.isSafeInteger(days) ||

        days < 1 ||

        days > CALENDAR_CONFIG.maximumRangeDays

    ) {

        throw new Error("Invalid deadline range.");

    }

    const endDate = addCalendarDays(

        today,

        days - 1

    );

    return sortCalendarEvents(

        events.filter(event =>

            event.type === "deadline" &&

            event.date <= endDate &&

            (

                includeOverdue ||

                event.date >= today

            )

        )

    );

}


/* =========================================================
   17. CALENDAR DASHBOARD STATISTICS
   ========================================================= */

export function calculateCalendarStatistics(

    events = [],

    today = getIndianDate()

) {

    const sevenDays = addCalendarDays(today, 6);

    const fifteenDays = addCalendarDays(today, 14);

    const thirtyDays = addCalendarDays(today, 29);

    const currentMonth = getMonthRange(today);

    const statistics = {

        totalEvents: events.length,

        totalHearings: 0,

        totalDeadlines: 0,

        hearingsToday: 0,

        hearingsNextSevenDays: 0,

        hearingsNextFifteenDays: 0,

        hearingsNextThirtyDays: 0,

        hearingsThisMonth: 0,

        overdueHearings: 0,

        deadlinesToday: 0,

        upcomingDeadlines: 0,

        overdueDeadlines: 0,

        urgentEvents: 0,

        highPriorityEvents: 0

    };

    for (const event of events) {

        const date = event.date;

        if (event.type === "hearing") {

            statistics.totalHearings++;

            if (date === today) {

                statistics.hearingsToday++;

            }

            if (date < today) {

                statistics.overdueHearings++;

            }

            if (date >= today && date <= sevenDays) {

                statistics.hearingsNextSevenDays++;

            }

            if (date >= today && date <= fifteenDays) {

                statistics.hearingsNextFifteenDays++;

            }

            if (date >= today && date <= thirtyDays) {

                statistics.hearingsNextThirtyDays++;

            }

            if (

                date >= currentMonth.startDate &&

                date <= currentMonth.endDate

            ) {

                statistics.hearingsThisMonth++;

            }

        }

        if (event.type === "deadline") {

            statistics.totalDeadlines++;

            if (date === today) {

                statistics.deadlinesToday++;

            }

            if (date < today) {

                statistics.overdueDeadlines++;

            }

            if (date >= today && date <= thirtyDays) {

                statistics.upcomingDeadlines++;

            }

        }

        if (event.priority === "urgent") {

            statistics.urgentEvents++;

        }

        if (event.priority === "high") {

            statistics.highPriorityEvents++;

        }

    }

    return statistics;

}


/* =========================================================
   18. INTERNAL DAILY CAUSE LIST

   Generated from the firm's recorded hearing dates.
   This is not an official court-issued cause list.
   ========================================================= */

export function generateDailyCauseList(

    events = [],

    date = getIndianDate(),

    filters = {}

) {

    const hearings = filterCalendarEvents(events, {

        ...filters,

        type: "hearing",

        startDate: date,

        endDate: date

    });

    hearings.sort((a, b) =>

        a.courtName.localeCompare(b.courtName)

        ||

        a.courtNumber.localeCompare(

            b.courtNumber,

            undefined,

            { numeric: true }

        )

        ||

        a.caseTitle.localeCompare(b.caseTitle)

    );

    const courts = new Map();

    for (const hearing of hearings) {

        const key = JSON.stringify([

            hearing.courtName || "Court not specified",

            hearing.courtCity || "",

            hearing.courtNumber || ""

        ]);

        if (!courts.has(key)) {

            courts.set(key, {

                courtName:

                    hearing.courtName ||

                    "Court not specified",

                courtCity: hearing.courtCity,

                courtNumber: hearing.courtNumber,

                hearings: []

            });

        }

        courts.get(key).hearings.push(hearing);

    }

    return {

        firm: CALENDAR_CONFIG.firmName,

        title: "Internal Daily Cause List",

        classification: "Confidential",

        date,

        formattedDate: formatCalendarDate(date, {

            weekday: "long"

        }),

        generatedAt: new Date().toISOString(),

        totalHearings: hearings.length,

        totalCourts: courts.size,

        courts: [...courts.values()],

        hearings,

        disclaimer:

            "Internal schedule based on recorded case dates. " +

            "Verify against the official court cause list."

    };

}


/* =========================================================
   19. FETCH CASE FOR HEARING RESCHEDULING
   ========================================================= */

export async function getHearingCase(caseId) {

    const administrator =

        await requireAdministrator();

    const record = await getCase(caseId);

    assertSession(administrator.uid);

    if (!isCalendarEligibleCase(record)) {

        throw new Error(

            "This case is closed or archived."

        );

    }

    if (record.matterType !== "litigation") {

        throw new Error(

            "Court hearings require a litigation matter."

        );

    }

    return {

        id: record.id,

        caseCode: record.caseCode,

        caseTitle: record.caseTitle,

        caseNumber: record.caseNumber || "",

        courtName: record.courtName || "",

        nextHearingDate: record.nextHearingDate || "",

        nextHearingPurpose:

            record.nextHearingPurpose || "",

        currentStage: record.currentStage || "",

        revision: record.revision

    };

}


/* =========================================================
   20. RESCHEDULE HEARING

   Updates the original case document using the
   existing revision-controlled transaction.

   Existing Case Management activity history
   automatically records the hearing update.
   ========================================================= */

export async function rescheduleHearing(

    caseId,

    input,

    expectedRevision

) {

    const administrator =

        await requireAdministrator();

    const nextHearingDate = String(

        input?.nextHearingDate || ""

    ).trim();

    const nextHearingPurpose = String(

        input?.nextHearingPurpose || ""

    ).trim();

    if (!isValidCalendarDate(nextHearingDate)) {

        throw new Error(

            "Please enter a valid hearing date."

        );

    }

    if (nextHearingDate < getIndianDate()) {

        throw new Error(

            "The next hearing date cannot be in the past."

        );

    }

    if (nextHearingPurpose.length > 500) {

        throw new Error(

            "Hearing purpose cannot exceed 500 characters."

        );

    }

    if (

        !Number.isSafeInteger(expectedRevision) ||

        expectedRevision < 1

    ) {

        throw new Error(

            "Invalid case revision. Refresh the calendar."

        );

    }

    const existing = await getCase(caseId);

    assertSession(administrator.uid);

    if (!isCalendarEligibleCase(existing)) {

        throw new Error(

            "Closed or archived cases cannot be rescheduled."

        );

    }

    if (existing.matterType !== "litigation") {

        throw new Error(

            "Only litigation matters can be rescheduled."

        );

    }

    if (existing.revision !== expectedRevision) {

        throw new Error(

            "The case was modified elsewhere. " +

            "Refresh before rescheduling."

        );

    }

    // Preserve current stage unless explicitly changed.

    const currentStage = String(

        input?.currentStage ??

        existing.currentStage ??

        ""

    ).trim();

    if (currentStage.length > 500) {

        throw new Error(

            "Current stage cannot exceed 500 characters."

        );

    }

    const updated = await updateCaseHearing(

        caseId,

        {

            nextHearingDate,

            nextHearingPurpose,

            currentStage

        },

        expectedRevision

    );

    assertSession(administrator.uid);

    return {

        success: true,

        caseId: updated.id,

        caseCode: updated.caseCode,

        caseTitle: updated.caseTitle,

        nextHearingDate: updated.nextHearingDate,

        nextHearingPurpose: updated.nextHearingPurpose,

        currentStage: updated.currentStage,

        revision: updated.revision

    };

}


/* =========================================================
   21. REMOVE SCHEDULED HEARING

   Clears the current next hearing date.
   Does not delete proceedings or case history.
   ========================================================= */

export async function clearScheduledHearing(

    caseId,

    expectedRevision

) {

    const administrator =

        await requireAdministrator();

    if (

        !Number.isSafeInteger(expectedRevision) ||

        expectedRevision < 1

    ) {

        throw new Error("Invalid case revision.");

    }

    const existing = await getCase(caseId);

    assertSession(administrator.uid);

    if (!isCalendarEligibleCase(existing)) {

        throw new Error(

            "This case cannot be modified."

        );

    }

    if (existing.revision !== expectedRevision) {

        throw new Error(

            "Case details have changed. Refresh first."

        );

    }

    const updated = await updateCaseHearing(

        caseId,

        {

            nextHearingDate: "",

            nextHearingPurpose: "",

            currentStage: existing.currentStage || ""

        },

        expectedRevision

    );

    assertSession(administrator.uid);

    return {

        success: true,

        caseId: updated.id,

        revision: updated.revision

    };

}


/* =========================================================
   22. CSV EXPORT UTILITIES

   Protect spreadsheet applications against
   formula injection from user-entered text.
   ========================================================= */

function escapeCSV(value) {

    let text = String(value ?? "");

    if (

        /^[\t\r\n]/.test(text) ||

        /^\s*[=+\-@]/.test(text)

    ) {

        text = "'" + text;

    }

    return `"${text.replace(/"/g, '""')}"`;

}


export function generateCalendarCSV(events = []) {

    const headers = [

        "Date",

        "Event Type",

        "Internal Case ID",

        "Case Title",

        "Court Case Number",

        "CNR Number",

        "Client Name",

        "Court",

        "Court City",

        "Court Number",

        "Assigned Advocate",

        "Hearing Purpose",

        "Current Stage",

        "Priority",

        "Case Status",

        "Overdue"

    ];

    const rows = sortCalendarEvents(events).map(event => [

        event.date,

        EVENT_TYPES[event.type] || event.type,

        event.caseCode,

        event.caseTitle,

        event.caseNumber,

        event.cnrNumber,

        event.clientName,

        event.courtName,

        event.courtCity,

        event.courtNumber,

        event.assignedAdvocate,

        event.purpose,

        event.currentStage,

        event.priority,

        event.status,

        event.isOverdue ? "Yes" : "No"

    ]);

    return "\uFEFF" +

        [headers, ...rows]

            .map(row => row.map(escapeCSV).join(","))

            .join("\r\n");

}


/* =========================================================
   23. CLOUD CONNECTION VERIFICATION
   ========================================================= */

export async function checkCalendarCloudConnection() {

    const administrator =

        await requireAdministrator();

    const records = await fetchCases({

        includeArchived: false

    });

    assertSession(administrator.uid);

    const events = buildCalendarEvents(records);

    return {

        connected: true,

        authorized: true,

        administrator: administrator.name,

        role: administrator.role,

        caseCount: records.length,

        calendarEventCount: events.length,

        dataSource: "Firebase Cloud Firestore",

        collection: "cases",

        timeZone: CALENDAR_CONFIG.timeZone,

        checkedAt: new Date().toISOString()

    };

}


/* =========================================================
   END OF HEARING CALENDAR CLOUD ENGINE

   MNM LEGAL ASSOCIATES

   Justice, Integrity & Excellence
   ========================================================= */
