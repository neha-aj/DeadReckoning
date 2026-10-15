/* Last online intel: what the phone cached from news / social / official channels
   before the network died. SIMULATED for the prototype: the places are real, the
   reports are fictional. In a real build this file is refreshed by intel sync while
   any connection exists (see DR.intel.sync), then the app keeps working from cache.

   kind:  origin  = where the outbreak started (hordes nest there, does not fade)
          report  = a sighting / incident (fades with age)
          block   = road physically blocked
          safe    = place reported holding / quiet (lowers danger)
   t:     minutes since Day 0 00:00 (Day 18 22:04 = network died)              */
window.DR_INTEL = {
  lastSync: 18 * 1440 + 22 * 60 + 4,
  reports: [
    { id: 'i01', kind: 'origin', src: 'News', who: 'City desk', t: 0 * 1440 + 9 * 60 + 40, lat: 12.9645, lng: 77.5772, r: 450, sev: 1.0, cred: 0.95,
      text: 'First violent cases reported inside KR Market. Police seal the market after attacks on vendors.' },
    { id: 'i02', kind: 'origin', src: 'Hospital', who: 'Hospital notice', t: 0 * 1440 + 13 * 60 + 5, lat: 12.9636, lng: 77.5737, r: 350, sev: 0.95, cred: 0.9,
      text: 'Victoria Hospital casualty ward overrun. Staff told to evacuate. Do not bring patients here.' },
    { id: 'i03', kind: 'report', src: 'X', who: '@namma_commuter', t: 18 * 1440 + 19 * 60 + 12, lat: 12.9757, lng: 77.5729, r: 300, sev: 0.85, cred: 0.7,
      text: 'Majestic metro gates jammed shut, hundreds trapped on the concourse, screaming inside. Avoid the station.' },
    { id: 'i04', kind: 'report', src: 'Police radio', who: 'Scanner relay', t: 18 * 1440 + 20 * 60 + 30, lat: 12.9794, lng: 77.5988, r: 280, sev: 0.8, cred: 0.85,
      text: 'Relief camp at Chinnaswamy Stadium breached from the north gate. Units falling back to Queens Road.' },
    { id: 'i05', kind: 'report', src: 'WhatsApp', who: 'Forwarded many times', t: 18 * 1440 + 17 * 60 + 50, lat: 12.9832, lng: 77.6045, r: 300, sev: 0.8, cred: 0.55,
      text: 'Bowring Hospital lockdown failed. Big crowd of infected moving towards Shivajinagar bus stand.' },
    { id: 'i06', kind: 'report', src: 'X', who: '@blr_local_watch', t: 18 * 1440 + 21 * 60 + 5, lat: 12.9862, lng: 77.6066, r: 220, sev: 0.65, cred: 0.6,
      text: 'Russell Market shutters broken, looters and infected both inside. Food stalls still stocked at the back.' },
    { id: 'i07', kind: 'report', src: 'Reddit', who: 'r/bangalore thread', t: 18 * 1440 + 16 * 60 + 20, lat: 12.9915, lng: 77.5705, r: 260, sev: 0.6, cred: 0.6,
      text: 'Mantri Mall area: crowds trying to break into the supermarket. Several attacks seen from a balcony.' },
    { id: 'i08', kind: 'block', src: 'Traffic police', who: 'Traffic alert', t: 18 * 1440 + 18 * 60 + 40, lat: 12.9843, lng: 77.5801, r: 70, sev: 1.0, cred: 0.9,
      text: 'Overturned BMTC bus blocks Seshadri Road near the flyover. Road closed both ways.' },
    { id: 'i09', kind: 'report', src: 'News', who: 'Live blog', t: 18 * 1440 + 15 * 60 + 0, lat: 12.9795, lng: 77.5805, r: 260, sev: 0.45, cred: 0.8,
      text: 'Fires in Gandhinagar lodges. Smoke across the area, people moving east on foot.' },
    { id: 'i10', kind: 'report', src: 'X', who: '@shivajinagar_updates', t: 18 * 1440 + 21 * 60 + 40, lat: 12.9880, lng: 77.6005, r: 240, sev: 0.55, cred: 0.5,
      text: 'Commercial Street and the lanes around it are packed with infected after dark. Do not cut through.' },
    { id: 'i11', kind: 'safe', src: 'FM radio', who: 'Settlement broadcast', t: 18 * 1440 + 21 * 60 + 55, lat: 12.9990, lng: 77.5921, r: 420, sev: 0.9, cred: 0.95,
      text: 'Survivor settlement at Palace Grounds: walls up, water and food inside. Gates open 06:00 to 20:30 every day for anyone arriving on foot; the beacon will keep broadcasting for 3 more days. Listen on FM 91.1.' },
    { id: 'i12', kind: 'safe', src: 'Police radio', who: 'Scanner relay', t: 18 * 1440 + 19 * 60 + 45, lat: 12.9760, lng: 77.5920, r: 380, sev: 0.5, cred: 0.7,
      text: 'Cubbon Park interior quiet: big open lawns, few people were inside when it started. Gates were chained shut on Day 1.' },
    { id: 'i13', kind: 'safe', src: 'News', who: 'City desk', t: 18 * 1440 + 20 * 60 + 10, lat: 12.9797, lng: 77.5907, r: 220, sev: 0.4, cred: 0.75,
      text: 'The relief checkpoint at Vidhana Soudha was abandoned on Day 2. Water cartons were left stacked by the east gate.' },
    { id: 'i14', kind: 'report', src: 'WhatsApp', who: 'Residents group', t: 18 * 1440 + 14 * 60 + 30, lat: 12.9930, lng: 77.5795, r: 200, sev: 0.35, cred: 0.45,
      text: 'A few infected seen near the Race Course back road. Most residents stayed indoors.' },
    { id: 'i15', kind: 'report', src: 'X', who: '@bmtc_watch', t: 18 * 1440 + 22 * 60 + 1, lat: 12.9778, lng: 77.5724, r: 320, sev: 0.75, cred: 0.75,
      text: 'Kempegowda Bus Station platforms full of stranded passengers. Fights breaking out, at least two bites seen.' },
  ],
};
