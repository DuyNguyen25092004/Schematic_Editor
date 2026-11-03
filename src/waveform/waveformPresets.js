/**
 * Predefined WaveJSON templates for WaveDrom Waveform Editor.
 * Follows WaveJSON standard: https://wavedrom.com/tutorial.html
 */

export const WAVEFORM_PRESETS = [
  {
    id: 'clk_data',
    name: 'Clock & Data Bus',
    description: 'Basic clock, multi-bit data, request & acknowledge signals',
    code: `{
  signal: [
    { name: "clk",  wave: "p.....|..." },
    { name: "data", wave: "x.345x|=.x", data: ["head", "body", "tail", "data"] },
    { name: "req",  wave: "0.1..0|1.0" },
    { name: "ack",  wave: "1.....|01." }
  ]
}`,
  },
  {
    id: 'spi',
    name: 'SPI Protocol',
    description: '4-wire SPI bus: CS#, SCLK, MOSI, MISO',
    code: `{
  signal: [
    { name: "CS#",  wave: "10........|1" },
    { name: "SCLK", wave: "0.p.......|0" },
    { name: "MOSI", wave: "x.3.4.5.6.|x", data: ["CMD", "ADDR", "DATA", "CRC"] },
    { name: "MISO", wave: "z.......3.|z", data: ["RESP"] }
  ],
  edge: [
    "0->1 CS assert",
    "8->9 CS release"
  ]
}`,
  },
  {
    id: 'i2c',
    name: 'I2C Transaction',
    description: 'Standard I2C Start, Address, R/W, Ack, Stop sequence',
    code: `{
  signal: [
    { name: "SCL", wave: "1.0.1.0.1.0.1.0.1." },
    { name: "SDA", wave: "10.3...4...5...0.1", data: ["ADDR[6:0]", "R/W", "ACK"] }
  ],
  edge: [
    "0->1 START",
    "16->17 STOP"
  ]
}`,
  },
  {
    id: 'counter4',
    name: '4-bit Counter',
    description: 'Synchronous counter with reset and state increments',
    code: `{
  signal: [
    { name: "clk",    wave: "p......." },
    { name: "rst_n",  wave: "01......" },
    { name: "q[3:0]", wave: "=3456789", data: ["0", "1", "2", "3", "4", "5", "6", "7"] }
  ]
}`,
  },
  {
    id: 'dff',
    name: 'D Flip-Flop with Timing Arrows',
    description: 'Clock to Q propagation delay with arrows',
    code: `{
  signal: [
    { name: "clk", wave: "p....." },
    { name: "D",   wave: "01.01." },
    { name: "Q",   wave: "0.1.01" }
  ],
  edge: [
    "0->1 clk-to-Q delay",
    "2->3 clk-to-Q delay"
  ]
}`,
  },
  {
    id: 'glitch',
    name: 'Glitches & Gaps',
    description: 'Demonstrates pulse glitches, cycle gaps, and high-impedance',
    code: `{
  signal: [
    { name: "clk",    wave: "p...|..." },
    { name: "strobe", wave: "010.|10." },
    { name: "glitch", wave: "0.h.|0.." },
    { name: "bus",    wave: "z.=.|=.z", data: ["valid", "data"] }
  ]
}`,
  },
  {
    id: 'blank',
    name: 'Custom (Minimal Starter)',
    description: 'Minimal starter waveform to build from scratch',
    code: `{
  signal: [
    { name: "clk", wave: "p....." },
    { name: "in",  wave: "0.1.0." },
    { name: "out", wave: "0...1." }
  ]
}`,
  },
];

export const DEFAULT_WAVEJSON = WAVEFORM_PRESETS[0].code;
