//#!node

import SerialPort from 'serialport';
import Readline from '@serialport/parser-readline';
import log4js from 'log4js';
import asciichart from 'asciichart';
import prom from 'prom-client';
import express from 'express';

prom.collectDefaultMetrics();

/** 
	Map(14) {
	  '$PSTATUS' => '',
	  'invalid' => '0',
	  'change' => '1',
	  'error_mHz' => '0.000000000',
	  'sum' => '0',
	  'count' => '826',
	  'locked' => '300',
	  'last' => '0',
	  'ovf' => '0',
	  'temp' => '54.3',
	  'dac' => '3598',
	  'fix' => '3',
	  'uptime' => '10703866',
	  '' => ''
	}
	*/
const metrics = {
	invalid : new prom.Gauge({ name: 'gpsdo_invalid', help: 'is invalid' }),
	change : new prom.Gauge({ name: 'gpsdo_change', help: 'change' }),
	error_mHz : new prom.Gauge({ name: 'gpsdo_error_mHz', help: 'error_mHz' }),
	sum : new prom.Gauge({ name: 'gpsdo_sum', help: 'sum' }),
	count : new prom.Gauge({ name: 'gpsdo_count', help: 'count' }),
	locked : new prom.Gauge({ name: 'gpsdo_locked', help: 'locked' }),
	last : new prom.Gauge({ name: 'gpsdo_last', help: 'last' }),
	ovf : new prom.Gauge({ name: 'gpsdo_ovf', help: 'ovf' }),
	temp : new prom.Gauge({ name: 'gpsdo_temp', help: 'temp' }),
	dac : new prom.Gauge({ name: 'gpsdo_dac', help: 'dac' }),
	fix : new prom.Gauge({ name: 'gpsdo_fix', help: 'fix' }),
	uptime : new prom.Gauge({ name: 'gpsdo_uptime', help: 'uptime' }),
}

const port = new SerialPort('/dev/ttyACM0', { baudRate: 256000 })
const logger = log4js.getLogger();
logger.level = 'debug';
log4js.configure({
	appenders: {
		log: { type: 'file', filename: 'log.log', backups: 356, compress: true, pattern: "-yyyy-MM-dd" }
	},
	categories: {
		default: { appenders: ['log'], level: 'debug' }
	}
});


const sleep = (n) => new Promise( (resolve) => setTimeout(resolve, n) );

const screen = {
	clear: function () {
		console.log('\x1b[2J');
	},
	move: function (x, y) {
		console.log(`\x1b[${y};${x};H`);
	}
};

const parser = new Readline()
port.pipe(parser)

const data = [];

parser.on('data', (line) => {
	logger.debug(line);
	console.log(line);
	if (line.indexOf("$PSTATUS") !== 0) return;
	const map = line.replace(/\*..\r?\n?$/, '').split(/,/).
		reduce( (r, i) => {
			const f = i.split(/:/);
			r.set(f.shift(), f.join(":"));
			return r;
		}, new Map());

	for (let [key, value] of map.entries()) {
		if (metrics[key]) {
			metrics[key].set(+value);
		}
	}

	data.unshift(map);
	const interval = 10;
	while (data.length > (interval * 300)) data.pop();

	const graph = [];
	for (let i = 0; i < data.length; i += interval) {
		let sum = 0, j = 0;
		for (; j < interval; j++) {
			if (!data[i + j]) break;
			sum += +data[i + j].get('dac');
		}
		graph.unshift(sum / j);
	}

	screen.clear();
	screen.move(1, 1);
	console.log(asciichart.plot(graph, {
		height: 40,
	}))
	console.log(map);
})


const app = express();

app.get("/metrics", async (req, res) => {
	res.set("Content-Type", "text/plain");
	res.send(await prom.register.metrics());
});

app.listen(4467, () => console.log(`[${new Date()}] server startup.`));

