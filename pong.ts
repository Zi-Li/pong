/**
 * Pong
 * @author Zi Li Tan
 * @since 27/8/2020
 * @modified 11/09/2020
 */

 //imports
import { fromEvent,interval, Observable } from 'rxjs'; 
import { map,filter,merge,scan } from 'rxjs/operators';

/**Game constants*/
const Constants = new class {
  /**Score required to win.*/
  readonly winningScore: number = 7;
  /**Set the UI colour: this is the walls, ball, scoreboard, and default paddle colour.*/
  readonly uiColour = "rgb(230,230,230)"; //this is light grey (as I don't like looking at plain white for a long time)
  /**Set the colour of the background, outside of the svg canvas.*/
  readonly documentColour = "rgb(102,204,225)"; //document background is set to blue to contrast with the walls more.
  /**This is the width of the top wall.*/                                     
  readonly topBound = 10; 
  /**This is the width of the bottom wall.*/
  readonly bottomBound = 10;
  /**This is the width of the side walls.*/
  readonly sideBound = 10;
  /**This is the width of the paddle (horizontal thickness).*/
  readonly paddleXWidth = 20;
  /**This is the default height of the paddle (vertical length).*/
  readonly paddleYWidth = 90;
  /**This is the radius of the ball.*/
  readonly ballRadius = 10; 
  /**This is the horizontal speed of the ball in pixels per tick.*/
  readonly ballBaseXSpeed = 5;
  /**This is the maximum vertical speed of the ball in pixels per tick (speed varies on which part of the paddle it hits).*/
  readonly ballBaseYSpeed = 8;
  /**This is the speed of the paddles in pixels per tick.*/
  readonly paddleSpeed = 5;
  /**This is a small speed boost to the AI paddle.*/
  readonly cpuCheating = 2;
  /**This is the starting amount of 'rage'.*/
  readonly startingEnergy = 4;
  /**This is the amount of pixels grown when using the paddle growth ability.*/
  readonly paddleGrowthAbility = 30;
  /**This is the amount the opponent's paddle gets shrunk when using the shrink ray ability.*/
  readonly paddleShrinkAbility = 15;
  /**This stores the colour progression of 'rage'.*/
  readonly rageColourProgression = //the colour based on rage level 0, 1, ...
          [this.uiColour,this.uiColour,this.uiColour, //at level 0-2, no change
          "rgb(240,220,220)","rgb(255,210,210)","rgb(255,190,190)",
          "rgb(255,150,150)","rgb(255,120,120)","rgb(255,100,100)",
          "rgb(255, 50, 50)","rgb(255, 20, 20)","rgb(255,  0,  0)"];

  /**This is the key for moving up.*/
  readonly upKey = "KeyW";
  /**This is the key for moving down.*/
  readonly downKey = "KeyS";
  /**This is the special key for using the growth ability.*/
  readonly specialKey_SizeUp = "KeyE";
  /**This is the special key for using the teleport ability.*/
  readonly specialKey_Teleport = "KeyR";
  /**This is the special key for using the shrink ray ability.*/
  readonly specialKey_ShrinkRay = "KeyQ";

  /**This is the width of the svg canvas. WARNING: you will need to update this value in pong.html as well.*/
  readonly canvasRight = 900;
  /**This is the height of the svg canvas. WARNING: you will need to update this value in pong.html as well.*/
  readonly canvasBottom = 600;
}
/**Type of valid key inputs.*/
type Key =  typeof Constants.upKey | 
            typeof Constants.downKey | 
            typeof Constants.specialKey_SizeUp | 
            typeof Constants.specialKey_Teleport | 
            typeof Constants.specialKey_ShrinkRay;
/**Type of valid events to watch for.*/
type Event = "keydown" | "keyup";

function pong() {
  /**
   * storage for the svg canvas element
   */
    const svg = document.getElementById("canvas"); //stores the current svg canvas
                                                      //since we use it a lot
    document.body.style.backgroundColor = Constants.documentColour; //sets the colour of the background. Purely aesthetic

    /**
     * function to change attributes of an Element
     * @param elem an Element to change the attributes of 
     * @param object a javascript object containing the properties to change, e.g., {id: "newid"}
     * Credit to Tim Dwyer at: https://stackblitz.com/edit/asteroids05
     */
    const changeAttributes = (elem:Element,properties:any) =>{ 
      for(const i in properties) {
        elem.setAttribute(i,String(properties[i])); 
      }
    }    

  //Body types, these contain the properties that needs to be known to draw the objects where we want
    /**
     * RectBody, this was initially the basic body to base everything off,
     * but then I realised circles and text are different enough to justify having separate types.
     * It stores an id, positions, velocity, and dimensions.
     * I called width and height xSize and ySize by personal preference (less ambiguous)
     */
    type RectBody = Readonly<{
      /**The string identifier of the RectBody.*/
      id: string; 
      /**
       * The x coordinate of the RectBody. 
       * Measured from the top left, and is relative to the svg canvas.
       */
      xPos: number; 
      /**
       * The y coordinate of the RectBody. 
       * Measured from the top left, and is relative to the svg canvas.
       */
      yPos: number; 
      /**
       * The horizontal speed of the RectBody.
       * Measured in pixels per tick (10 miliseconds).
       */
      xVel: number; 
      /**
       * The vertical speed of the RectBody.
       * Measured in pixels per tick (10 miliseconds).
       */
      yVel: number; 
      /**The width of the RectBody.*/
      xSize: number; 
      /**The height of the RectBody.*/
      ySize: number;
      /**Storage for the 'rage' level of paddles.*/
      energy: number;
      /**The colour of the RectBody.*/
      colour: string;
    }>

    /**
     * this is to track which player scored/won
     * 0 is the default 'netural' state, 1 is the player won, 2 is the CPU won
     */
    type scoreUpdateTracker = null | "p" | "c"
    /**
     * this is for circles:
     *  notably the position is based off the middle instead of top left, a radius is needed,
     *   and since we use this for the ball, we have a tracker to note when it hits a scoring wall.
     *    (since collision handling returns a CircleBody)
     */
    type CircleBody = Readonly<{
      /**The string identifier of the CircleBody.*/
      id: string;
      /**The x position of the circle. Measured from the centre in relation to the svg canvas.*/
      xPos: number;
      /**The y position of the circle. Measured from the centre in relation to the svg canvas.*/
      yPos: number;
      /**
       * The horizontal speed of the RectBody.
       * Measured in pixels per tick (10 miliseconds).
       */
      xVel: number;
      /**
       * The vertical speed of the RectBody.
       * Measured in pixels per tick (10 miliseconds).
       */
      yVel: number;
      /**The radius of the circle.*/
      radius: number;
      /**The colour of the circle.*/
      colourOveride: string;
      /**A marker for the ball to use to tell if it scored.*/
      scoreUpdate: scoreUpdateTracker; //null = no score, "player" = player scored, "cpu" = cpu scored
    }>
    /**
     * this is for text objects:
     *  notably, we can adjust text size, and text content
     */
    type TextBody = Readonly<{
      /**The string identifier for the text.*/
      id: string; 
      /**
       * The x coordinate of the RectBody. 
       * Measured from the top left, and is relative to the svg canvas.
       */
      xPos: number;
      /**
       * The y coordinate of the RectBody. 
       * Measured from the top left, and is relative to the svg canvas.
       */
      yPos: number;
      /**The text size.*/
      size: number;
      /**If the text stores a number, place the number here for easy access.*/
      numeric: number;
      /**The content of the text to print out.*/
      content: string;
      /**The text colour.*/
      colour: string;
    }>


    /**
     * draws the side walls of the game
     * note: impure- modifies the svg canvas
     */
    const drawWalls = () => {
      const //create the RectBodies to draw
      leftWall: RectBody = {
        id: 'WallL',
        xPos: 0,
        yPos: 0,
        xVel: 0,
        yVel: 0,
        xSize: Constants.sideBound,
        ySize: Constants.canvasBottom,
        energy: undefined,
        colour: Constants.uiColour
      },
      rightWall: RectBody = {
        id: 'WallR',
        xPos: Constants.canvasRight - Constants.sideBound,
        yPos: 0,
        xVel: 0,
        yVel: 0,
        xSize: Constants.sideBound,
        ySize: Constants.canvasBottom,
        energy: undefined,
        colour: Constants.uiColour
      },
      topWall: RectBody = {
        id: 'WallT',
        xPos: 0,
        yPos: 0,
        xVel: 0,
        yVel: 0,
        xSize: Constants.canvasRight,
        ySize: Constants.topBound,
        energy: undefined,
        colour: Constants.uiColour
      },
      bottomWall: RectBody = {
        id: 'WallB',
        xPos: 0,
        yPos: Constants.canvasBottom - Constants.bottomBound,
        xVel: 0,
        yVel: 0,
        xSize: Constants.canvasRight,
        ySize: Constants.bottomBound,
        energy: undefined,
        colour: Constants.uiColour
      }
      /**
       * function to draw a rect onto the svg canvas
       * @param b the RectBody to draw
       */
      const drawRectangle = (b:RectBody) => {
        //create the element
        const elem = document.createElementNS(svg.namespaceURI, 'rect');
        changeAttributes(elem, //set the attribute of the element
           {id: b.id, 
            x: b.xPos, 
            y: b.yPos, 
            width: b.xSize, 
            height: b.ySize,
            fill: b.colour});
        svg.appendChild(elem); //attach the element onto the svg canvas
      }
      //draw the rectangles for the walls
      drawRectangle(leftWall);
      drawRectangle(rightWall);
      drawRectangle(topWall);
      drawRectangle(bottomWall);  
    }   
    /**
     * draws the still elements (currently just the walls)
     * note: impure- modifies the svg canvas
     */
    const drawStaticObjects = () => {
      drawWalls();
    }

    /**
     * simple function to get a colour for the rage level
     * @param level the rage level, or return the last tier rage level colour
     */
    const getRageColour = (level:number):string =>
            level >= Constants.rageColourProgression.length? //this prevents us from getting index errors
            Constants.rageColourProgression[Constants.rageColourProgression.length-1]
            : Constants.rageColourProgression[level] //this gets the colour from the defined constant

    //Body generators

      /**
       * creates a generic paddle
       * @param name the id of the paddle
       * @param xPosition the x position of the paddle
       * @param colouring the function that colours the paddle (function returns a string using the energy number)
       * @param width the width of the paddle
       */
      const genericPaddle = (name: string, xPosition: number, colouring:((_:number)=>string), width = Constants.paddleXWidth) =>
                                (position: number, velocity: number, energy_ = Constants.startingEnergy, length = Constants.paddleYWidth) =>
                                { return {
                                  id: name,
                                  xPos: xPosition,
                                  yPos: position,
                                  xVel: 0,
                                  yVel: velocity,
                                  xSize: width,
                                  ySize: length,
                                  energy: energy_,
                                  colour: colouring(energy_) 
                                }}

      /**
       * Generates the RectBody object representing the state of the player's paddle
       * @param position the y position of the player's paddle
       * @param velocity the y velocity of the player's paddle
       * @energy the energy level of the paddle
       * @param length the height of the paddle
       */
    const playerPaddle = genericPaddle("PaddlePlayer", Constants.sideBound + 20, getRageColour, Constants.paddleXWidth);
  
    /**
     * Generates the RectBody object representing the state of the computer's paddle
     * @param position the y position of the computer's paddle
     * @param velocity the y velocity of the computer's paddle
     * @param energy_ the energy level of the paddle
     * @param length the height of the paddle
     */
    const aiPaddle = genericPaddle("PaddleAI", Constants.canvasRight - Constants.paddleXWidth - 20 - Constants.sideBound, 
                                        (_)=>Constants.uiColour, Constants.paddleXWidth);

    /**
     * Generates the CircleBody object representing the state of the ball
     * @param xPos the x position of the ball (note: for circles, the position is of the centre)
     * @param yPos the y position of the ball
     * @param xVel the x velocity of the ball
     * @param yVel the y velocity of the ball
     */
    const ball = (xPos: number, yPos: number, xVel: number, yVel: number, score:scoreUpdateTracker = null, Colour=Constants.uiColour, r = Constants.ballRadius) => {
      return <CircleBody>{
        id: "ball",
        xPos: xPos,
        yPos: yPos,
        xVel: xVel,
        yVel: yVel,
        radius: r,
        colourOveride: Colour,
        scoreUpdate: score
      }
    }

    /**
     * generic function to make a text body
     * @param name the id of the body
     * @param xpos the x position of the body
     * @param ypos the y position of the body
     * @param size_ the size of the text
     * @param extra a bit of extra text that goes before the number
     * @param colourGen a function that takes a number to generate a colour (string)
     */
    const genericText = (name: string, xpos: number, ypos: number, size_: number, extra: string, colourGen:((_:number)=>string)) => (num: number) => {
      return {
        id: name,
        xPos: xpos,
        yPos: ypos,
        size: size_,
        numeric: num,
        content: num === undefined? extra : `${extra}${num.toString()}`,
        colour: colourGen(num)
      }
    }

    /**
     * Generates the TextBody for the player's scoreboard
     * @param points the number of points the player is/should be on
     */
    const playerScore = genericText("ScorePlayer", Constants.canvasRight/4, Constants.topBound + 64, 64, "", (_)=>Constants.uiColour);

    /**
     * Generates the TextBody for the CPU's scoreboard
     * @param points the number of points the cpu is/should be on
     */
    const aiScore = genericText("ScoreAI", Constants.canvasRight*3/4 - 64, Constants.topBound + 64, 64, "", (_)=>Constants.uiColour);

    /**
     * creates the TextBody for the player's energy level
     * @param energy a number, the energy level of the player
     */
    const playerEnergy = genericText("playerEnergy", Constants.canvasRight/4, Constants.canvasBottom - Constants.bottomBound - 32, 32, "Rage: ", getRageColour);

    /**
     * paddleGenerator type are the functions that create the RectBody for paddles
    */
    type paddleGenerator = typeof playerPaddle | typeof aiPaddle;
    //type ballGenerator = typeof ball; //commented out as it is unused
    /**
     * scoreGenerator type are the functions that create the TextBody for scores
     */
    type scoreGenerator = typeof playerScore | typeof aiScore;
    //type energyGenerator = typeof playerEnergy; //commented out as it is unused

  //key handlers
    /**
     * function for processing a specific key input
     * @param event the event that we are processing
     * @param key the key press from that event
     * @param action the action to do as a result of that event
     * Credit to Tim Dwyer at: https://stackblitz.com/edit/asteroids05 
     */
    const keyCheck = <T>(event: Event, key: Key, action: ()=>T) => 
      fromEvent<KeyboardEvent>(document, event).pipe(
        filter((e)=> e.code === key), //gets rid of events not of the right key press
        map(action)); //for all the remining key presses that are 'right', do action
    /**
     * a function for processing movement keys
     * @param key they key pressed
     * @param multiplier a multipler on the Constant.paddleSpeed. Use negatives to go upwards.
     */
    const movekeyCheck = (key:Key, multiplier: number) => keyCheck("keydown", key, ()=>new Movement(multiplier*Constants.paddleSpeed,0))

    /**Storage for movement velocities, wrapped in the constructor parameters*/
    class Movement {constructor(public readonly y: number, public readonly x: number){}} //used to process movement velocities
    /**Stores growth size*/
    class PaddleGrowth {constructor(public readonly size: number) {}}
    /**An immediate position change*/
    class Teleport {constructor() {}}
    /**Stores an amount to shrink*/
    class PaddleShrink {constructor(public readonly size: number) {}}
    /**Subtract one energy from a paddle*/
    class Drain {constructor(){}}

    type Actions = Movement | PaddleGrowth | Teleport | PaddleShrink | Drain;

    //these observers manage the keypresses
    const keyUpArrow = movekeyCheck(Constants.upKey, -1); //negative is upwards
    const keyDownArrow = movekeyCheck(Constants.downKey, 1);
    const keyE = keyCheck("keydown", Constants.specialKey_SizeUp, ()=> new PaddleGrowth(Constants.paddleGrowthAbility));
    const keyQ = keyCheck("keydown", Constants.specialKey_ShrinkRay, ()=> new PaddleShrink(Constants.paddleShrinkAbility))
    const keyR = keyCheck("keydown", Constants.specialKey_Teleport, ()=> new Teleport())
    /**
     * Processing movements by keydown inputs leads to a lot of stutter, so instead we use a 
     * keyup as a stop sign for the movements.
     */
    const keyRelease = fromEvent<KeyboardEvent>(document, "keyup").pipe(
      filter((e)=>e.type==="keyup"),
      map((e)=>new Movement(0,0))); //stop speed when key realsed
    

  //States
    //State type tracks the gameplay states
    /**
     * State types are used to contain all the required bodies for each tick of the game
     */
    type State = Readonly<{
      /**The player's paddle*/
      paddleOne: RectBody,
      /**The ai's paddle*/
      paddleTwo: RectBody,
      /**The ball*/
      ball: CircleBody,
      /**The player's scoreboard*/
      scoreOne: TextBody,
      /**The ai's scoreboard*/
      scoreTwo: TextBody,
      /**The player's energy display*/
      playerEnergy: TextBody,
      /**A number to track whether we need to end the game or not (and who won)*/
      winnerIs: scoreUpdateTracker
      }>


    /**
     * increments a scoreboard by 1
     * @param curren the current TextBody of the scoreboard
     * @param target the function that produces the textbody needed (for player or CPU)
     * @return a TextBody of the next 'position' its in
     */
    const changeScore = (target: scoreGenerator) =>(curren: TextBody):TextBody => {
      return target(curren.numeric+1);
    }
    /**Increments the player's score by 1. @param current the TextBody of the player's current score*/
    const changePlayerScore = changeScore(playerScore);
    /**Increments the ai's score by 1. @param current the TextBody of the ai's current score*/
    const changeCpuScore = changeScore(aiScore);


  //Create defaults
    const halfway = Constants.topBound + (Constants.canvasBottom - Constants.bottomBound - Constants.topBound)/2
    /**
     * creates the default paddleState for the paddles
     * @param paddle the playerPaddle or aiPaddle functions
     * @param yPos the y position of the paddle
     * @param energy the energy level of the paddle
     * @param length the height of the paddle
     */
    const createDefaultPaddleState = (paddle: paddleGenerator, yPos = halfway - (Constants.paddleYWidth/2), 
                                            energy = Constants.startingEnergy, length = Constants.paddleYWidth):RectBody => {
      return paddle(yPos, 0, energy, length);
    }
    /**The default state of the player paddle.*/
    const defaultPlayerPaddleState = createDefaultPaddleState(playerPaddle);
    /**The default state of the AI paddle.*/
    const defaultAiPaddleState = createDefaultPaddleState(aiPaddle);

    //NOTE: defaultBallStates are functions so that the Math.random gets re-evaluated each time we reset the ball
    /**
     * the generic state of the default ball
     * @param multiplierX a multiplier for the x speed value (set to -ve to move left)
     * @param multiplierY a multiplier for the y speed value (set to 0 to stop movement vertically)
     */
    const genericDefaultBall = (multiplierX: number, multiplierY = 1) => (xSpeed = Constants.ballBaseXSpeed, ySpeed = Constants.ballBaseYSpeed, hMid = Constants.canvasRight/2, vMid = Constants.canvasBottom/2) => {
      const yVelocity = Math.round(Math.random()>0.5? ySpeed*Math.random()/2:-ySpeed*Math.random()/3); //get a random y velocity
      return ball(hMid, vMid, multiplierX*xSpeed, multiplierY*yVelocity) //ball is stationary until a begin signal is sent
    ;}

    //Ball starts moving towards player
    /**Sets the ball in the centre moving towards the player.*/
    const defaultBallState1: ()=>CircleBody = genericDefaultBall(-1);
    //Ball starts moving towards CPU
    /**Sets the ball in the centre moving towards the AI.*/
    const defaultBallState2 = genericDefaultBall(1);
    //Ball is stationary (for end of game)
    /**Sets the ball in the centre with no velocity.*/
    const defaultStillBall = genericDefaultBall(0, 0);

    /**
     * a function to generate the default scoreState object
     * @param person the function for either to player scoreboard or cpu scoreboard
     */
    const createDefaultScoreState = (person: scoreGenerator): TextBody => {
          return person(0);
    }    
    /**The default state for player's scoreboard.*/
    const defaultPlayerScoreState = createDefaultScoreState(playerScore);
    /**The default state for ai's scoreboard*/
    const defaultCPUScoreState = createDefaultScoreState(aiScore);

    /**
     * the default energy level of the player
     */
    const defaultPlayerEnergyState = playerEnergy(Constants.startingEnergy);

    /**
     * this stores the default game state for starting and restarting the game
     */
    const defaultEverythingState: State = {
      paddleOne: defaultPlayerPaddleState,
      paddleTwo: defaultAiPaddleState,
      ball: defaultBallState2(),
      scoreOne: defaultPlayerScoreState,
      scoreTwo: defaultCPUScoreState,
      playerEnergy: defaultPlayerEnergyState,
      winnerIs: null
    }


  //High level movement handlers
    /**
     * gets the next paddleState 
     * @param prev the previous paddleState
     * @param paddle the stuff from the observable that tracks key input
     * @param person the function to indicate whether this is for the player or computer
     * @param ball optional, the circle body of the ball
     */
    const makePaddleState = (person: paddleGenerator) => (prev: RectBody, paddle: Actions, ball?: CircleBody) =>
                            paddle instanceof Movement?
                                movingPaddleState(person)(prev,  paddle.y)
                            : paddle instanceof PaddleGrowth && prev.energy > 0?
                                person(prev.yPos, prev.yVel, prev.energy-1, paddle.size + prev.ySize)
                            : paddle instanceof Teleport && prev.energy > 0?
                                person(ball.yPos, ball.yVel, prev.energy-1, prev.ySize)
                            : paddle instanceof Drain && prev.energy > 0?
                                person(prev.yPos, prev.yVel, prev.energy-1, prev.ySize)
                            : paddle instanceof PaddleShrink?
                                person(prev.yPos, prev.yVel, prev.energy, prev.ySize - paddle.size)
                                : movingPaddleState(person)(prev, prev.yVel);
                            
    /**
     * returns a Movement that points towards the ball's vertical direction
     * @param s the surrent state of the game
     * @param b the circle body of the ball
     * @param speed read from constants, the speed of the CPU's paddle (sum base speed plus cheat)
     */
    const followBall = (paddle: RectBody, b: CircleBody, speed = Constants.paddleSpeed+Constants.cpuCheating): Movement => {
      const paddleLoc = paddle.yPos + (paddle.ySize/2), //get location of paddle's centre
            ballLoc = b.yPos; //get location of ball
      return paddleLoc < ballLoc? new Movement(speed, 0) : //return movement in direction
             paddleLoc > ballLoc? new Movement(-1*speed, 0) :
             new Movement(0,0)
    }
    /**
     * function to actually move a paddle- that is take a paddleState and change its velocity
     * @param paddle the paddleState object
     * @param person the function for the player or ai paddle
     * @param vel the velocity to set
     * @param top read from constants, the size of the top wall (so, the bottom of the top wall)
     * @param bottomWall calculate using constants, the top of the bottom wall
     */
    const movingPaddleState = (person: paddleGenerator) => (paddle: RectBody, vel:number, 
      top = Constants.topBound, bottomWall = Constants.canvasBottom - Constants.bottomBound):RectBody => {
        const yPosition = paddle.yPos;
        const bottom = bottomWall - paddle.ySize
        const newYPos = yPosition + vel;
        const p = (yPosition>top&&yPosition<bottom)||(yPosition<=top&&vel>=0)||(yPosition>=bottom&&vel<=0)? //checks for collision with roof/floor
                  (newYPos<top)&&(vel<0)? person(top,0,paddle.energy,paddle.ySize) : (newYPos>bottom)&&(vel>0)? person(bottom, 0,paddle.energy,paddle.ySize) :
                    person(yPosition+vel,vel,paddle.energy,paddle.ySize) : 
                    person(yPosition, 0,paddle.energy,paddle.ySize)                  
        return p;
      };

    /**
     * check the collisions of the ball
     * @param b the circleBody of the ball
     * @param player the RectBody of the player's paddle
     * @param cpu the RectBody of the CPU's paddle
     * @param speed read from constants, the y speed of the ball
     * @param canvasWidth read from constants, the canvas right
     * @param canvasHeight read from constants, the canvas bottom
     * @param sideWallSize read from constants, the side wall's width
     * @param topWallSize read from constants, the top wall width
     * @param botWallSize read from constants, the bottom wall's width
     * @return the circleBody of the ball after the movement
     */
    const movingBallState = (b: CircleBody, player: RectBody, cpu: RectBody, speed = Constants.ballBaseYSpeed,
                                  canvasWidth = Constants.canvasRight, canvasHeight = Constants.canvasBottom, sideWallSize = Constants.sideBound,
                                  topWallSize = Constants.topBound, botWallSize = Constants.bottomBound) =>  {
      const calculateBallVel = (ymin, ymax, impactZone) => { //going to use a simple function: rounded distance from center/8 + base speed
        const center = (ymax + ymin)/2,
              distVector = impactZone - center,
              distance = distVector < 0? -1*distVector : distVector;
        return speed*Math.random() + distance/8;
      }
      const //get details of player paddle
            playerXleft = player.xPos, playerYtop = player.yPos,
            playerXright = playerXleft + player.xSize, playerYbottom = playerYtop + player.ySize,
            //get details of cpu paddle
            cpuXleft = cpu.xPos, cpuYtop = cpu.yPos,
            cpuXright = cpuXleft + cpu.xSize, cpuYbottom = cpuYtop + cpu.ySize,
            //get details of ball     NOTE: we still need the yBounds of the ball to check the paddle impacts
            yPos = b.yPos, xPos = b.xPos,
            xBounds = [b.xPos-b.radius, b.xPos+b.radius],
            yBounds = [b.yPos-b.radius, b.yPos+b.radius], //note: remember that smaller numbers are upwards      
            makeBall = (velX: number, velY: number,score:scoreUpdateTracker = null) => ball(xPos,yPos,velX,velY,score);
      return /*check if hit sides*/   xBounds[0] <= sideWallSize? makeBall(0, 0, 'c') : //impact left wall
                                      xBounds[1] >= canvasWidth - sideWallSize? ball(xPos,yPos,0, 0, 'p') : //impact right wall
             /*check if hit roof*/    (yBounds[0] <= topWallSize && b.yVel < 0) || (yBounds[1] >= canvasHeight-botWallSize && b.yVel > 0)? 
                                                      ball(xPos+b.xVel,yPos-b.yVel,b.xVel,-1*b.yVel,null) : //impact roof or floor, double check with velocity
                                      //check if hit player's paddle
             /*check if hit paddle*/ (playerXleft<=xBounds[0]&&xBounds[0]<=playerXright) //check the x bounds of paddle
                                        &&((playerYtop<=yBounds[0]&&yBounds[0]<=playerYbottom)||(playerYtop<=yBounds[1]&&yBounds[1]<=playerYbottom)) //check the y counds of paddl
                                        &&(canvasWidth>xPos) //checks the half of the board the ball is in
                                        &&(b.xVel<0)? //checks the direction of the ball
                                          ball(xPos-b.xVel,yPos+calculateBallVel(playerYtop,playerYbottom,yPos),-1*b.xVel, calculateBallVel(playerYtop,playerYbottom,yPos),null) :
                                      //check if hit cpu's paddle                                               
                                     (cpuXleft<=xBounds[1]&&xBounds[1]<=cpuXright)//checks x bounds
                                        &&((cpuYtop<=yBounds[0]&&yBounds[0]<=cpuYbottom)||(cpuYtop<=yBounds[1]&&yBounds[1]<=cpuYbottom)) //checks y bounds
                                        &&(canvasWidth/2<xPos) //checks which half of board
                                        &&(b.xVel>0)? //checks direction of ball
                                          ball(xPos-b.xVel,yPos+calculateBallVel(cpuYtop,cpuYbottom,yPos),-1*b.xVel, calculateBallVel(cpuYtop,cpuYbottom,yPos),null) : 
            /*otherwise, no collisions*/ ball(xPos+b.xVel,yPos+b.yVel,b.xVel, b.yVel, null);
    }

    /**
     * this is used to create a new State, so that we can keep it immutable
     * @param player the RectBody of the player
     * @param cpu the RectBody of the CPU
     * @param b the CircleBody of the ball
     * @param sc1 the TextBody of the player's scoreboard
     * @param sc2 the TextBody of the CPU's scoreboard
     * @param energy the TextBody of the player's energy
     * @param winner the number 0, 1, or 2 to track if no one, the player, or the CPU has won (default 0)
     */
    const createState = (player: RectBody, cpu: RectBody, b: CircleBody, sc1: TextBody, sc2: TextBody, energy: TextBody, winner:scoreUpdateTracker = null) => {
      return <State>{
        paddleOne: player,
        paddleTwo: cpu,
        ball: b,
        scoreOne: sc1,
        scoreTwo: sc2,
        playerEnergy: energy,
        winnerIs: winner
      }
    };
    
    /**
     * simple observer to filter out spacebar presses. Exclusively for start/restart game
     */
    const waitSpacebar = fromEvent<KeyboardEvent>(document,"keydown").pipe(filter(e => e.code === "Space"))

    /**
     * function that gives the prompt to start the game
     * note: impure- modifies the svg canvas
     */
    const waitToStart = () => {
      /**
       * copy and paste of the create subfunction within the drawText function defined in runGame
       * @param b the textbody to be drawn
       */
      const drawText = (b: TextBody) => {
        const elem = document.createElementNS(svg.namespaceURI, 'text');
        changeAttributes(elem, 
           {id: b.id, 
            x: b.xPos, 
            y: b.yPos, 
            'font-size': b.size,
            fill: b.colour});
        elem.textContent = b.content;
        svg.appendChild(elem);
        return elem;
      }
      const prompt:TextBody = genericText("startGamePrompt", Constants.canvasRight/4, Constants.canvasBottom/2,
                                          32, "Press Spacebar to begin...", (_)=>Constants.uiColour)(undefined);

      drawText(prompt)
      const sub = waitSpacebar.subscribe((_)=>{
        svg.removeChild(document.getElementById("startGamePrompt"))
        //restart the game
        sub.unsubscribe()
        runGame()});
    }

    /**
     * This is the funtion that runs the required starting functions
     * note: impure- modifies the svg canvas
     */
    const runGame = () => {
      //Drawing functions
    /**
     * draws a rectangle onto the svg canvas or opens an existing rectangle and change its position
     * @param b a Body object, containing an id, x and y positions, width, and height
     * @return the rectangle element created
     * note: impure- modifies the svg canvas
     */
    const drawRectangle = (b:RectBody) => {
      /**create a rect on the svg canvas*/
      const create = () => {
        const elem = document.createElementNS(svg.namespaceURI, 'rect');
        changeAttributes(elem, 
           {id: b.id, 
            x: b.xPos, 
            y: b.yPos, 
            width: b.xSize, 
            height: b.ySize,
            fill: b.colour});
        svg.appendChild(elem);
        return elem;
      }
      //update the position, size, and colour
      const elem = document.getElementById(b.id) || create();
      changeAttributes(elem, {
        x: b.xPos,
        y: b.yPos,
        width: b.xSize,
        height: b.ySize,
        fill: b.colour
      });
      return elem;
    }
    /**
     * draws a circle onto the svg canvas, or edits an existing one's position and radius
     * @param b the CircleBody, object that contains the properties of the circle
     * note: impure- modifies the svg canvas
     */
    const drawCircle = (b:CircleBody) => {
      /**creates a circle on the svg canvas*/
      const create = () => {
        const elem = document.createElementNS(svg.namespaceURI, 'circle');
        changeAttributes(elem, 
           {id: b.id, 
            cx: b.xPos, 
            cy: b.yPos, 
            r: b.radius, 
            fill: b.colourOveride});
        svg.appendChild(elem);
        return elem;
      }
      //update the position, size and colour
      const elem = document.getElementById(b.id) || create();
      changeAttributes(elem, {
        cx: b.xPos,
        cy: b.yPos,
        r: b.radius,
        fill: b.colourOveride
      });
      return elem;
    };
    /**
     * draws a text onto the svg canvas, or edits an existing one's position and content
     * @param b the TextBody, object that contains the properties of the text
     * note: impure- modifies the svg canvas
     */
    const drawText = (b:TextBody) => {
      /**Creates a new svg text element*/
      const create = () => {
        const elem = document.createElementNS(svg.namespaceURI, 'text');
        changeAttributes(elem, 
           {id: b.id, 
            x: b.xPos, 
            y: b.yPos, 
            'font-size': b.size,
            fill: b.colour});
        elem.textContent = b.content;
        svg.appendChild(elem);
        return elem;
      }
      //update the element's position, size, and colour
      const elem = document.getElementById(b.id) || create();
      changeAttributes(elem, {
        x: b.xPos,
        y: b.yPos,
        'font-size': b.size,
        fill: b.colour
      });
      elem.textContent = b.content;
      return elem;
    };
      /**
       * this function is for updating the svg canvas, and keeps an eye on whether to end the game
       * @param s the State of the game
       * note: impure- modifies the svg canvas
       */
      const updateView = (s: State) => {
        //updates the canvas
        drawRectangle(s.paddleOne);
        drawRectangle(s.paddleTwo);
        drawCircle(s.ball);
        drawText(s.scoreOne);
        drawText(s.scoreTwo);
        drawText(s.playerEnergy);
        if (s.winnerIs != null) { //game ends, call gameOver
          gameOver(s.winnerIs);
        }
      }
      /**
       * this function handles the actual ending of the game, and watching for restarts
       * @param winner the numbers 1 or 2 to indicate if the winner is the player or CPU
       */
      const gameOver = (winner:scoreUpdateTracker) => {
          //TextBody for the victory message
          const victoryMessage:TextBody = genericText("victory", Constants.canvasRight/4, Constants.canvasBottom/2,
                                                    84, "You Win :)", (_)=>"RGB(100,255,100)")(undefined);

          //TextBody for the defeat message
          const defeatMessage:TextBody = genericText("defeat", Constants.canvasRight/4, Constants.canvasBottom/2,
                                                      84, "You Lose :(", (_)=>"RGB(255,100,100)")(undefined);
          if (winner === "p") {drawText(victoryMessage)} //print player wins
          else if (winner === "c") {drawText(defeatMessage)} //print CPU wins
          //stop running game
          game.unsubscribe();
          //watch for spacebar input
          const sub = waitSpacebar.subscribe((_)=>{
            if (winner === "p") {svg.removeChild(document.getElementById("victory"))} //remove player wins message
            else if (winner === "c") {svg.removeChild(document.getElementById("defeat"))} //remove CPU wins message
            //restart the game
            sub.unsubscribe()
            runGame()});
      }

      /**
       * this observable keeps the game running
       */
      const ticker = interval(10); //timer for game ticks - 100fps. Map periodically called functions here
      /**
       * this observable tracks key presses
       */
      const keyPress = new Observable().pipe(merge(keyUpArrow,keyDownArrow,keyE,keyR,keyQ, keyRelease));

      //draw the starting state
      updateView(defaultEverythingState);

      const createEndState = (acc: State, s: Actions, whoWon: scoreUpdateTracker) => createState( 
          //reset all states
          playerPaddle(defaultPlayerPaddleState.yPos,defaultPlayerPaddleState.yVel,acc.playerEnergy.numeric,defaultPlayerPaddleState.ySize),
          aiPaddle(defaultAiPaddleState.yPos,defaultAiPaddleState.yVel,acc.paddleTwo.energy,defaultAiPaddleState.ySize),
          defaultStillBall(),
          //set the marker that player has won
          acc.scoreOne,acc.scoreTwo, acc.playerEnergy, whoWon);

      const createStandardParseState = (acc:State, s:Actions, energyDrain: number) => createState(
          //run action on player
          makePaddleState(playerPaddle)(acc.paddleOne,s,acc.ball),
          //handle computer's movement
          makePaddleState(aiPaddle)(acc.paddleTwo,followBall(acc.paddleTwo, acc.ball)),
          //handle ball's movement
          movingBallState(acc.ball, acc.paddleOne, acc.paddleTwo),
          //handle scoreboard update (no update)
          acc.scoreOne, acc.scoreTwo,
          //modify player's energy
          playerEnergy(acc.playerEnergy.numeric - energyDrain));

      /**
       * main game observer
       */
      const gameObserver = ticker.pipe(
        //start by merging the ticker with the key watching observable
        merge(keyPress), 
        //this scan runs the bulk of the game's processing
        scan((acc: State, s: Actions) => { 
          //if the E or R key was pressed, grow/teleport the paddle
          return (s instanceof PaddleGrowth || s instanceof Teleport) && acc.playerEnergy.numeric > 0 ? 
              createStandardParseState(acc, s, 1)
          //if shrink ray was used
          : s instanceof PaddleShrink? 
            //check energy
            acc.playerEnergy.numeric > 0?
              createState(
                //drain 1 energy from player
                makePaddleState(playerPaddle)(acc.paddleOne,new Drain()),
                //shrink ai paddle
                makePaddleState(aiPaddle)(acc.paddleTwo,s),
                //keep score and ball the same
                movingBallState(acc.ball, acc.paddleOne, acc.paddleTwo),
                acc.scoreOne, acc.scoreTwo, 
                //drain 1 energy
                playerEnergy(acc.playerEnergy.numeric-1)):
            //do nothing if lacking energy
            createStandardParseState(acc, new Movement(0,0), 0):
          //if the player scored:
          acc.ball.scoreUpdate==="p"? createState(
              //reset player position
              playerPaddle(defaultPlayerPaddleState.yPos,defaultPlayerPaddleState.yVel,acc.playerEnergy.numeric,defaultPlayerPaddleState.ySize),
              //reset computer's position
              aiPaddle(defaultAiPaddleState.yPos,defaultAiPaddleState.yVel,acc.paddleTwo.energy,defaultAiPaddleState.ySize),
              //reset ball's position
              defaultBallState1(),
              //increase player's score, 
              changePlayerScore(acc.scoreOne), acc.scoreTwo,
              //increase player's energy
              playerEnergy(acc.playerEnergy.numeric)):
          //else if the CPU scored:
          acc.ball.scoreUpdate==="c"? createState(
              //reset player position
              playerPaddle(defaultPlayerPaddleState.yPos,defaultPlayerPaddleState.yVel,acc.playerEnergy.numeric+1,defaultPlayerPaddleState.ySize),
              //reset computer's position
              aiPaddle(defaultAiPaddleState.yPos,defaultAiPaddleState.yVel,acc.paddleTwo.energy,defaultAiPaddleState.ySize),
              //reset ball's position
              defaultBallState2(),
              //increase CPU's score
              acc.scoreOne, changeCpuScore(acc.scoreTwo),
              //maintain player's energy
              playerEnergy(acc.playerEnergy.numeric+1)):
          //else if player won the game:
          parseInt(acc.scoreOne.content) === Constants.winningScore? 
              createEndState(acc, s, 'p') :
          //else if CPU won the game:
          parseInt(acc.scoreTwo.content) === Constants.winningScore? 
              createEndState(acc, s, 'c'):
          //otherwise, no one scored, so move everything according to their velocities:
              //handle player movement
              createStandardParseState(acc, s, 0)},
      //when we just started, we should be in the defaultEverythingState position
      defaultEverythingState))
      const game = gameObserver.subscribe(updateView);

    }

    drawStaticObjects();
    waitToStart();
  }

  // the following simply runs your pong function on window load.  Make sure to leave it in place.
  if (typeof window != 'undefined')
    window.onload = ()=>{
      pong();
    }
  


  /* Code graveyard: these are all the things that I spent enough time on that I didn't want to delete,
  but it was too messy to just comment all of them out */

  //Basic movement/update functions
    /**
     * takes a paddle and moves it based on its velocity.
     * @param paddle the state of the body to move
     * @param person either the playerPaddle or aiPaddle function
     * @return a paddleState of the next position
     * UNUSED: not necessary after removing paddleState
     */
    // const movePaddle = (paddle: RectBody, person:(pos:number, vel:number)=>RectBody) => () => 
    //                                                               person(paddle.yPos + paddle.yVel, paddle.yVel);

    /**
     * takes a ball and moves it based on its velocity
     * @param b the CircleBody of the ball
     * @return a ballState of the next position
     * UNUSED: not necessary after removing ballState
     */
    // const moveBall = (b: CircleBody) => () => 
    //   ball(b.xPos + b.xVel, b.yPos + b.yVel, b.xVel, b.yVel)

    //using lazy lists to track the current Bodies and next ones 
    //UNUSED: it wasn't necessary, so we switched to storing bodies directly in STate
    // interface paddleState {
    //   current: RectBody;
    //   next: () => paddleState;
    // }
    // interface ballState {
    //   current: CircleBody;
    //   next: () => ballState;
    // }

    // interface scoreState {
    //   current: TextBody;
    //   next: () => scoreState;
    // }


