/**
 * MLB Scoreboard App Logic
 */

const API_BASE_URL = 'https://statsapi.mlb.com/api/v1';
const REFRESH_INTERVAL_MS = 10000; // 10 seconds

// DOM Elements
const datePicker = document.getElementById('game-date');
const dateDisplay = document.getElementById('current-date-display');
const gamesGrid = document.getElementById('games-grid');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const lastUpdatedIndicator = document.getElementById('last-updated');

// State
let currentDate = new Date();
let refreshIntervalId = null;

// Initialize
function init() {
    // Set date picker to today in YYYY-MM-DD local timezone
    const offset = currentDate.getTimezoneOffset();
    const localDate = new Date(currentDate.getTime() - (offset * 60 * 1000));
    const todayStr = localDate.toISOString().split('T')[0];
    datePicker.value = todayStr;

    // Listeners
    datePicker.addEventListener('change', (e) => {
        handleDateChange(e.target.value);
    });

    // Initial Fetch
    fetchAndRenderGames();
    startPolling();
}

function startPolling() {
    if (refreshIntervalId) clearInterval(refreshIntervalId);
    refreshIntervalId = setInterval(fetchAndRenderGames, REFRESH_INTERVAL_MS);
}

function handleDateChange(dateString) {
    if (!dateString) return;
    
    // Parse the local date string properly
    const [year, month, day] = dateString.split('-');
    currentDate = new Date(year, month - 1, day);
    
    updateDateDisplay();
    
    // Fetch new games immediately immediately and reset polling
    fetchAndRenderGames();
    startPolling();
}

function updateDateDisplay() {
    const today = new Date();
    const isToday = 
        currentDate.getDate() === today.getDate() &&
        currentDate.getMonth() === today.getMonth() &&
        currentDate.getFullYear() === today.getFullYear();

    if (isToday) {
        dateDisplay.textContent = "Today's Games";
    } else {
        const options = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
        dateDisplay.textContent = currentDate.toLocaleDateString('en-US', options);
    }
}

async function fetchAndRenderGames() {
    try {
        // Format date for API (YYYY-MM-DD)
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const apiDate = `${year}-${month}-${day}`;

        // Hydrate brings in linescore, probablePitcher, person
        // decisions gives us winning/losing pitcher
        // probablePitcher and team give us preview game starters and abbreviations
        const url = `${API_BASE_URL}/schedule?sportId=1&date=${apiDate}&hydrate=linescore,person,decisions,probablePitcher,team`;
        
        lastUpdatedIndicator.textContent = 'Updating...';
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const data = await response.json();
        const games = data.dates && data.dates.length > 0 ? data.dates[0].games : [];
        
        renderGames(games);
        
        // Blink live indicator to show a successful refresh
        setTimeout(() => {
            const today = new Date();
            const isToday = apiDate === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            lastUpdatedIndicator.textContent = isToday ? 'Live' : 'Past Data';
        }, 500);

    } catch (error) {
        console.error('Failed to fetch MLB dates:', error);
        gamesGrid.innerHTML = `<div class="state-container"><p style="color:var(--accent-red)">Failed to load games data. Please try again.</p></div>`;
    }
}

function renderGames(games) {
    if (!games || games.length === 0) {
        gamesGrid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    
    // Create HTML for all games
    const gamesHTML = games.map(game => createGameCardHTML(game)).join('');
    
    // Update DOM (Using innerHTML is fine for simple replacement, faster than D3 for this scale, 
    // but in a real React app would diff. For vanilla, it'll recreate DOM nodes).
    gamesGrid.innerHTML = gamesHTML;
}

function createGameCardHTML(game) {
    const status = game.status.detailedState;
    const isPreview = game.status.abstractGameState === 'Preview';
    const isLive = game.status.abstractGameState === 'Live';
    const isFinal = game.status.abstractGameState === 'Final';
    
    const awayTeam = game.teams.away;
    const homeTeam = game.teams.home;
    
    let headerClass = isLive ? 'status-live' : (isFinal ? 'status-final' : 'status-scheduled');
    let headerText = isLive ? (game.linescore ? `${game.linescore.inningState} ${game.linescore.currentInningOrdinal}` : status) : status;
    
    if (isPreview) {
        const gameTime = new Date(game.gameDate);
        headerText = gameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    }

    return `
        <div class="game-card">
            <div class="game-header ${headerClass}">
                <span>${headerText}</span>
            </div>
            
            <div class="teams-container">
                <div class="rhe-header">
                    <span>R</span>
                    <span>H</span>
                    <span>E</span>
                </div>
                ${createTeamRowHTML(awayTeam, "away", game.linescore)}
                ${createTeamRowHTML(homeTeam, "home", game.linescore)}
            </div>
            
            ${isLive ? createLiveGameDetailsHTML(game) : ''}
            ${(!isLive && !isPreview && isFinal) ? createFinalGameDetailsHTML(game) : ''}
            ${isPreview ? createScheduledStartersHTML(game) : ''}
        </div>
    `;
}

function createTeamRowHTML(teamData, homeOrAway, linescore) {
    // Show empty stats if the game hasn't started or we don't have them
    let r = '', h = '', e = '';
    
    if (linescore && linescore.teams && linescore.teams[homeOrAway.toLowerCase()]) {
        const stats = linescore.teams[homeOrAway.toLowerCase()];
        r = stats.runs !== undefined ? stats.runs : '';
        h = stats.hits !== undefined ? stats.hits : '';
        e = stats.errors !== undefined ? stats.errors : '';
    } else if (teamData.score !== undefined) {
        // Fallback to just the score if linescore isn't fully populated yet
        r = teamData.score;
    }

    const record = teamData.leagueRecord ? `${teamData.leagueRecord.wins}-${teamData.leagueRecord.losses}` : '';
    const teamId = teamData.team.id;
    const logoUrl = `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
    
    // Determine winner/loser classes if the game has a winner
    let teamClass = '';
    if (teamData.isWinner === true) teamClass = 'winner';
    else if (teamData.isWinner === false && r !== '') teamClass = 'loser';

    return `
        <div class="team-row ${teamClass}">
            <div class="team-info">
                <img class="team-logo" src="${logoUrl}" alt="${teamData.team.name} Logo" onerror="this.style.display='none'">
                <div>
                    <div class="team-name">${teamData.team.name}</div>
                    <div class="team-record">${record}</div>
                </div>
            </div>
            <div class="team-stats">
                <div class="stat-box run-box">${r}</div>
                <div class="stat-box">${h}</div>
                <div class="stat-box">${e}</div>
            </div>
        </div>
    `;
}

function createLiveGameDetailsHTML(game) {
    const linescore = game.linescore;
    if (!linescore) return '';

    const isMiddleOrEnd = linescore.inningState === 'Middle' || linescore.inningState === 'End';
    
    let detailsHTML = `<div class="game-details">`;

    if (!isMiddleOrEnd && linescore.offense && linescore.defense) {
        // Active at-bat
        const pitcher = linescore.defense.pitcher ? linescore.defense.pitcher.fullName : 'Unknown';
        const batter = linescore.offense.batter ? linescore.offense.batter.fullName : 'Unknown';
        
        detailsHTML += `
            <div class="detail-row">
                <span class="detail-label">Pitching</span>
                <span class="detail-value"><strong>${pitcher}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Batting</span>
                <span class="detail-value"><strong>${batter}</strong></span>
            </div>
            <div class="detail-row" style="margin-top: 0.5rem">
                <span class="detail-label">Count</span>
                <span class="detail-value">${linescore.balls}-${linescore.strikes}, ${linescore.outs} Out</span>
            </div>
        `;
    } else if (isMiddleOrEnd && linescore.offense) {
        // Between innings: Show Due Up
        const batter1 = linescore.offense.batter ? linescore.offense.batter.fullName : '';
        const batter2 = linescore.offense.onDeck ? linescore.offense.onDeck.fullName : '';
        const batter3 = linescore.offense.inHole ? linescore.offense.inHole.fullName : '';
        
        detailsHTML += `
            <div class="detail-row">
                <span class="detail-label">Due Up (${linescore.inningHalf === 'Top' ? 'Home' : 'Away'})</span>
            </div>
            <div class="due-up-list">
                ${batter1 ? `<div class="due-up-item">${batter1}</div>` : ''}
                ${batter2 ? `<div class="due-up-item">${batter2}</div>` : ''}
                ${batter3 ? `<div class="due-up-item">${batter3}</div>` : ''}
            </div>
        `;
    }

    detailsHTML += `</div>`;
    return detailsHTML;
}

function createFinalGameDetailsHTML(game) {
    if (!game.decisions || !game.decisions.winner || !game.decisions.loser) {
        return '';
    }
    
    const wp = game.decisions.winner.fullName;
    const lp = game.decisions.loser.fullName;

    return `
        <div class="final-pitchers">
            <div class="pitcher-row">
                <span class="detail-label" style="color:var(--text-secondary);">WP:</span>
                <span class="detail-value"><strong>${wp}</strong></span>
            </div>
            <div class="pitcher-row">
                <span class="detail-label" style="color:var(--text-secondary);">LP:</span>
                <span class="detail-value"><strong>${lp}</strong></span>
            </div>
        </div>
    `;
}

function createScheduledStartersHTML(game) {
    const awayTeamId = game.teams.away.team.id;
    const homeTeamId = game.teams.home.team.id;
    
    // We try to use abbreviation if hydrated, otherwise fallback to name snippet or standard abbreviation if possible
    const getAbbreviation = (teamData) => teamData.team.abbreviation || teamData.team.name.substring(0, 3).toUpperCase();
    
    const awayAbbrev = getAbbreviation(game.teams.away);
    const homeAbbrev = getAbbreviation(game.teams.home);
    
    const awayPitcher = game.teams.away.probablePitcher ? game.teams.away.probablePitcher.fullName : 'TBD';
    const homePitcher = game.teams.home.probablePitcher ? game.teams.home.probablePitcher.fullName : 'TBD';

    return `
        <div class="scheduled-starters">
            <div class="scheduled-header">Scheduled Starters</div>
            <div class="pitcher-row">
                <span class="detail-label" style="color:var(--text-secondary);">${awayAbbrev}:</span>
                <span class="detail-value"><strong>${awayPitcher}</strong></span>
            </div>
            <div class="pitcher-row">
                <span class="detail-label" style="color:var(--text-secondary);">${homeAbbrev}:</span>
                <span class="detail-value"><strong>${homePitcher}</strong></span>
            </div>
        </div>
    `;
}

// Boot up
document.addEventListener('DOMContentLoaded', init);
