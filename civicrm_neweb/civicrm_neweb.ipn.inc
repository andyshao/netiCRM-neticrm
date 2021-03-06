<?php
civicrm_initialize();
require_once 'CRM/Core/Payment/BaseIPN.php';
require_once "CRM/Core/DAO.php";

function civicrm_neweb_ipn($instrument, $post = NULL, $get = NULL, $print = TRUE){
  // detect variables
  $post = !empty($post) ? $post : $_POST;
  $get = !empty($get) ? $get : $_GET;

  require_once 'CRM/Core/BAO/PaymentProcessor.php';
  require_once 'CRM/Contribute/DAO/Contribution.php';

  // process the real contribution verify
  require_once 'CRM/Utils/Array.php';
  require_once 'CRM/Core/Payment/NewebIPN.php';
  $NewebIPN = new CRM_Core_Payment_NewebIPN($post, $get);
  if( !empty($get['module']) || $instrument == 'ezpay' ) {
    $result = $NewebIPN->main($get['module'], $instrument);
    if(!empty($result) && $print){
      echo $result;
    }
  }else{
    watchdog('neweb', "Error for doesn't retrive module from url.", array(), WATCHDOG_WARNING);
  }
}

class CRM_Core_Payment_NewebIPN extends CRM_Core_Payment_BaseIPN {
    static $_paymentProcessor = null;
    public $_post = NULL;
    public $_get = NULL;

    function __construct($post, $get) {
        parent::__construct( );
        $this->_post = $post;
        $this->_get = $get;
    }

    static function retrieve( $name, $type, $location = 'POST', $abort = true ) 
    {
        static $store = null;
        $value = CRM_Utils_Request::retrieve( $name, $type, $store,
                                              false, null, $location );
        if ( $abort && $value === null ) {
            CRM_Core_Error::debug_log_message( "Could not find an entry for $name in $location" );
            echo "Failure: Missing Parameter";
            exit();
        }
        return $value;
    }

    function getInput( &$input) {
      foreach ($this->_post as $key => $value) {
        $post[strtoupper($key)] = $value;
      }
      $input['CheckSum'] = CRM_Utils_Array::value('CHECKSUM', $post);
      $input['PRC'] = CRM_Utils_Array::value('PRC', $post);
      $input['SRC'] = CRM_Utils_Array::value('SRC', $post);
      $input['ApprovalCode'] = CRM_Utils_Array::value('APPROVALCODE', $post);
      $input['BankResponseCode'] = CRM_Utils_Array::value('BANKRESPONSECODE', $post);
      $input['MerchantNumber'] = CRM_Utils_Array::value('MERCHANTNUMBER', $post);
      $input['OrderNumber'] = CRM_Utils_Array::value('ORDERNUMBER', $post);
      $input['Amount'] = CRM_Utils_Array::value('AMOUNT', $post);
      $input['amount'] = $input['Amount'];
      $input['BatchNumber'] = CRM_Utils_Array::value('BATCHNUMBER', $post);
      $input['cardnumber'] = CRM_Utils_Array::value('CARDNUMBER', $post);
      $input['issuebank'] = CRM_Utils_Array::value('ISSUEBANK', $post);
      $input['EngName'] = CRM_Utils_Array::value('ENGNAME', $post);
    }

    function addNote($note, &$contribution){
      require_once 'CRM/Core/BAO/Note.php';
      $note = date("Y/m/d H:i:s"). ts("Transaction record").": \n".$note."\n===============================\n";
      $note_exists = CRM_Core_BAO_Note::getNote( $contribution->id, 'civicrm_contribution' );
      if(count($note_exists)){
        $note_id = array( 'id' => reset(array_keys($note_exists)) );
        $note = $note . reset($note_exists);
      }
      else{
        $note_id = NULL;
      }
      
      $noteParams = array(
        'entity_table'  => 'civicrm_contribution',
        'note'          => $note,
        'entity_id'     => $contribution->id,
        'contact_id'    => $contribution->contact_id,
        'modified_date' => date('Ymd')
      );
      CRM_Core_BAO_Note::add( $noteParams, $note_id );
    }


    function recur( &$input, &$ids, &$objects) {
      // check contribution first.
      $contribution =& $objects['contribution'];
      $order_num = $input['OrderNumber'];
      $note = $note ? $note : '';
      $failed = false;

      if ( $contribution->total_amount != $input['amount'] ) {
        CRM_Core_Error::debug_log_message( "Amount values dont match between database and IPN request" );
        $note .= ts("Failuare: Amount values dont match between database and IPN request")."\n";
        $failed = true;
      }
      else {
        $contribution->total_amount = $input['amount'];
      }

      require_once 'CRM/Core/Transaction.php';
      $transaction = new CRM_Core_Transaction();

      $participant =& $objects['participant'];
      $membership  =& $objects['membership' ];

      $signature = $objects['paymentProcessor']['signature'];
      $checksum = md5($input['MerchantNumber'].$input['OrderNumber'].$input['PRC'].$input['SRC'].$signature.$input['Amount']);
      if($checksum != $input['CheckSum']){
        CRM_Core_Error::debug_log_message( "Checksum Error" );
        $error = ts("Failuare: Transaction number and system response number doesn't match. Please contact us for further assistant.");
        $note .= $error."\n";
        $this->failed( $objects, $transaction, $error);
        $failed = true;
      }

      if($input['PRC'] || $input['SRC']){
        $error = civicrm_neweb_response($input['PRC'], $input['SRC'], $input['BankResponseCode'], 'detail');
        $error_code = ts('Error Code:')."PRC-{$input['PRC']},SRC-{$input['SRC']},BRC-{$input['BankResponseCode']}";
        $failed_reason = implode("\n", $error) . "\n" . $error_code;
        $note .= $failed_reason;
        $this->failed($objects, $transaction, $failed_reason);
        $failed = true;
      }
      $this->addNote($note, $contribution);

      // start recuring
      $recur =& $objects['contributionRecur'];
      if($failed){
        CRM_Core_Error::debug_log_message( "Cancel recurring immediately." );
        $params = array();
        $params['id'] = $recur->id;
        $params['cancel_date'] = date('YmdHis');
        $null = NULL;
        CRM_Contribute_BAO_ContributionRecur::add($params, $null);
      }
      else{
        require_once 'CRM/Core/Payment.php';
        CRM_Core_Error::debug_log_message( "Start building recurring object." );

        // caculate date of recurring contrib
        $time = REQUEST_TIME;
        $now = date( 'YmdHis', $time);
        // fix dates that already exist
        $dates = array('create', 'start', 'end', 'cancel', 'modified');
        foreach($dates as $date) {
          $name = "{$date}_date";
          if ( $recur->$name ) {
            $recur->$name = CRM_Utils_Date::isoToMysql( $recur->$name );
          }
        }

        // building recurring object stuff
        $recur->processor_id = $objects['paymentProcessor']->id;

        // caculate end_date
        $recur->create_date = $recur->create_date ? $recur->create_date : $now;
        $recur->modified_date =  $now;
        
        _civicrm_neweb_end_date_calculate($recur);

        $alter = array(
          'module' => 'civicrm_neweb',
          'params' => $input,
          'object' => $recur,
        );
        drupal_alter('civicrm_recur_params', $alter);
        
        $params = (array) $alter['object'];
        $null = NULL;
        CRM_Contribute_BAO_ContributionRecur::add($params, $null);
        CRM_Core_Error::debug_log_message( "Done the recurring object save." );
        CRM_Core_DAO::executeQuery("INSERT INTO civicrm_contribution_neweb_recur (recur_id,order_num,cycle) VALUES ($recur->id, $order_num, 0)");

        //recurring Notification email for user
        require_once 'CRM/Contribute/BAO/ContributionPage.php';
        CRM_Core_Error::debug_log_message( "Start to send recurring notify" );
        //CRM_Contribute_BAO_ContributionPage::recurringNotify( 'START', $ids['contact'], $ids['contributionPage'], $recur);
        
        // now, complete the transaction
        $contribution =& $objects['contribution'];
        $contribution->receive_date = date('YmdHis');
        $input['trxn_id'] = $input['OrderNumber'];
        $note .= ts('Completed')."\n";
        $is_recur = TRUE;
        $this->completeTransaction($input, $ids, $objects, $transaction, $is_recur);
        $this->addNote($note, $contribution);
      }
    }

    function go( &$input, &$ids, &$objects) {
      $contribution =& $objects['contribution'];
      $order_num = $contribution->id;
      $note = $note ? $note : '';
      $failed = false;

      if ( $order_num != $input['OrderNumber'] ) {
        CRM_Core_Error::debug_log_message( "OrderNumber values doesn't match between database and IPN request" );
        $note .= ts("Failuare: OrderNumber values doesn't match between database and IPN request")."\n";
        $failed = true;
      } 

      if ( $contribution->total_amount != $input['amount'] ) {
        CRM_Core_Error::debug_log_message( "Amount values dont match between database and IPN request" );
        $note .= ts("Failuare: Amount values dont match between database and IPN request")."\n";
        $failed = true;
      }
      else {
        $contribution->total_amount = $input['amount'];
      }

      require_once 'CRM/Core/Transaction.php';
      $transaction = new CRM_Core_Transaction();

      $participant =& $objects['participant'];
      $membership  =& $objects['membership' ];

      $signature = $objects['paymentProcessor']['signature'];
      $checksum = md5($input['MerchantNumber'].$input['OrderNumber'].$input['PRC'].$input['SRC'].$signature.$input['Amount']);
      if($checksum != $input['CheckSum']){
        CRM_Core_Error::debug_log_message("Checksum Error");
        $failed_reason = ts("Failuare: Transaction number and system response number doesn't match. Please contact us for further assistant.");
        $note .= $failed_reason."\n";
        $this->failed($objects, $transaction, $failed_reason);
        $failed = true;
      }

      if($input['PRC'] || $input['SRC']){
        $error = civicrm_neweb_response($input['PRC'], $input['SRC'], $input['BankResponseCode'], 'detail');
        $error_code = ts('Error Code:')."PRC-{$input['PRC']},SRC-{$input['SRC']},BRC-{$input['BankResponseCode']}";
        $failed_reason = implode("\n", $error) . "\n" . $error_code;
        $note .= $failed_reason;
        $this->failed($objects, $transaction, $failed_reason);
        $failed = true;
      }

      if(!$failed){
        // check if contribution is already completed, if so we ignore this ipn
        $contribution->receive_date = date('YmdHis');
        $input['trxn_id'] = $input['OrderNumber'];
        if ( $contribution->contribution_status_id == 1 ) {
            $transaction->commit();
            CRM_Core_Error::debug_log_message( "returning since contribution has already been handled" );
            $note .= ts('Duplicate submitting. This aontribution has already been handled.')."\n";
            $return = true;
        }
        else{
          $note .= ts('Completed')."\n";
          $this->completeTransaction( $input, $ids, $objects, $transaction);
        }
      }

      $this->addNote($note, $contribution);

      return $return;
    }

    function ezpay($post){
      require_once 'CRM/Contribute/DAO/Contribution.php';
      require_once 'CRM/Core/Payment/BaseIPN.php';
      require_once 'CRM/Core/Transaction.php';

      // Do something when payment processor system send post to call ezpay url.
      $input = $objects = $ids = $result = array();
      $result = $post;

      require_once("civicrm_neweb.cron.inc");

      $c = new CRM_Contribute_DAO_Contribution();
      $c->id = $result['ordernumber'];
      $c->find(true);

      require_once 'CRM/Contribute/BAO/Contribution.php';
      $ids = CRM_Contribute_BAO_Contribution::buildIds($c->id, false);
      $ids['contact'] = $c->contact_id;
      $ids['contribution'] = $c->id;
      $pid = $c->payment_processor_id;

      if(!empty($ids['participant'])){
        $input['component'] = 'event';
      }else{
        $input['component'] = 'contribute';
      }

      $transaction = new CRM_Core_Transaction();
      $ipn = new CRM_Core_Payment_BaseIPN();
      if($ipn->validateData($input, $ids, $objects, TRUE, $pid)){

        // after validate, start to complete some transaction
        $input['trxn_id'] = $c->trxn_id;
        $input['payment_instrument_id'] = $c->payment_instrument_id;
        $input['check_number'] = $result['writeoffnumber'];
        $input['amount'] = $result['amount'];
        if($result['timepaid']){
          $objects['contribution']->receive_date = $result['timepaid'];
        }
        else{
          $objects['contribution']->receive_date = date('YmdHis');
        }
        $ipn->completeTransaction($input, $ids, $objects, $transaction);

        // note here;
        $note .= ts("Merchant number").": ".$result['merchantnumber']."\n";
        $note .= ts("Order number").": ".$result['ordernumber']."\n";
        $note .= ts("Serial number").": ".$result['serialnumber']."\n";
        $note .= ts("Payment Instrument").": ". $result['paymenttype']."\n";
        $note .= ts("External order number").": ".$result['writeoffnumber']."\n";
        // $note .= ts("Create date").": ".$result['timecreated']."\n";
        $note .= ts("Paid date").": ".$result['timepaid']."\n";
        $note .= ts("Amount").": ".$result['amount']."\n";
        // $note .= ts("Pay count").": ".$result['paycount']."\n";
        $note .= ts("Tel").": ".$result['tel']."\n";
        $note .= ts("Hash").": ".$result['hash']."\n";
        $note .= ts("Completed");
        $this->addNote($note, $c);
      }else{
        $note .= ts("Error").": ".ts("Validate Error")."\n";
        $this->addNote($note, $c);
      }



    }

    function getIds( &$ids , $component){
      $ids['contact'] = CRM_Utils_Array::value('contact_id', $this->_get);
      $ids['contribution'] = CRM_Utils_Array::value('cid', $this->_get);
      if ( $component == 'event' ) {
        $ids['event'] = CRM_Utils_Array::value('eid', $this->_get);
        $ids['participant'] = CRM_Utils_Array::value('pid', $this->_get);
      }
      else {
        $ids['membership'] = CRM_Utils_Array::value('mid', $this->_get);
        $ids['contributionRecur'] = CRM_Utils_Array::value('crid', $this->_get);
        $ids['contributionPage'] = CRM_Utils_Array::value('cpid', $this->_get);
        $ids['related_contact'] = CRM_Utils_Array::value('rid', $this->_get);
        $ids['onbehalf_dupe_alert'] = CRM_Utils_Array::value('onbehalf_dupe_alert', $this->_get);
      }
    }

    function main( $component = 'contribute', $instrument = NULL , $input = NULL, $ids = NULL, $objects = NULL) {
      require_once 'CRM/Utils/Request.php';
      $objects = $ids = $input = array();

      if(empty($instrument)){
        $instrument = arg(2);
      }
      if(!empty($instrument) && $instrument == 'ezpay'){
        return $this->ezpay($this->_post);
      }

      if(empty($component)){
        $component = CRM_Utils_Array::value('module', $this->_get);
      }
           
      if(!$input){
        $input['component'] = $component;
        $this->getInput( $input);
      }

      if(!$ids){
        $this->getIds($ids, $component);
      }
       
      // save record
      $post = !empty($this->_post) ? $this->_post : $input;
      $record = array(
        'cid' => $ids['contribution'],
        'prc' => $input['PRC'],
        'src' => $input['SRC'],
        'bankrc' => $input['BankResponseCode'],
        'approvalcode' => $input['ApprovalCode'],
        'data' => json_encode($post),
      );
      drupal_write_record('civicrm_contribution_neweb', $record, 'cid');

      if ( ! $this->validateData( $input, $ids, $objects ) ) {
        return false;
      }

      // Check if the contribution status is wait for ipn or not. #15542
      if($objects['contribution']->contribution_status_id !== "2"){
        return ;
      }

      self::$_paymentProcessor =& $objects['paymentProcessor'];
      if($ids['contributionRecur'] && $objects['contribution']->contribution_recur_id ){
        return $this->recur($input, $ids, $objects);
      }
      else{
        return $this->go($input, $ids, $objects);
      }
    }
}

function dwd($in){
  ob_start();
  print '<pre>';
  print_r($in);
  print '</pre>';
  $c = ob_get_contents();
  ob_end_flush();
  watchdog('civicrm_neweb', $c);
}


function civicrm_neweb_response($prc, $src, $brc = NULL, $mode = 'normal'){
  if($mode == 'detail'){
    $error[] = $prc . ' : ' . civicrm_neweb_prc($prc);
    $error[] = $src . ' : ' . ts('SRC');
    $error[] = $brc . ' : ' . civicrm_neweb_brc($brc);
  }
  else{
    $error['nopaid'] = ts("Transaction failed. You won't be doing any charge of this transaction. Below is the detail of this failed transaction:");
    if($prc == 8){
  "contribution";
      $error[] = civicrm_neweb_prc($prc);
      $error[] .= ': '.ts("This may occurred because you press the back button of browser. You can ignore this transaction, and try <a href='%1'>create a new one.</a>.", array($dup_link));
    }
    elseif($prc == 52){
      $error[] = civicrm_neweb_prc($prc);
      if($brc){
        $error[] .= ": ".civicrm_neweb_brc($brc);
      }
    }
    elseif($prc == 34){
      $error[] = civicrm_neweb_prc($prc);
      if($brc){
        $error[] .= ": ".civicrm_neweb_brc($brc);
      }
    }
    else{
      $error['system'] = ts("Network or system error. Please try again a minutes later, if you still can't success, please contact us for further assistance.");
      if($brc){
        $error[] = civicrm_neweb_brc($brc);
      }
    }
  }
  watchdog('civicrm_neweb', "prc = $prc, src = $src, brc = $brc, error : \n" . implode("\n", $error));
  return $error;
}

// Bank response	
function civicrm_neweb_brc($c = NULL){
  static $code = array();

  $code['00'] = ts('BRC: Approved or completed successfully ');
  $code['01'] = ts('BRC: Refer to card issuer');
  $code['02'] = ts('BRC: Refer to card issuer\'s special conditions');
  $code['03'] = ts('BRC: Invalid merchant');
  $code['04'] = ts('BRC: Pick-up card');
  $code['05'] = ts('BRC: Do not honour');
  $code['06'] = ts('BRC: Error');
  $code['07'] = ts('BRC: Pick-up card, special condition');
	$code['08'] = ts('BRC: Honour with identification');
	$code['11'] = ts('BRC: Approved(VIP)');
  $code['12'] = ts('BRC: Invalid transaction');
  $code['13'] = ts('BRC: Invalid amount');
  $code['14'] = ts('BRC: Invalid card number (no such number)');
  $code['15'] = ts('BRC: No such issuer');
  $code['19'] = ts('BRC: Re-Enter Transaction');
  $code['21'] = ts('BRC: No Action Taken (Unable back out prior trans)');
  $code['25'] = ts('BRC: Unable to Locate Record in File');
  $code['28'] = ts('BRC: File Temporarily not Available for Update or Inquiry');
  $code['30'] = ts('BRC: Format error');
	$code['31'] = ts('BRC: Bank not supported by switch');
  $code['33'] = ts('BRC: Expired card');
	$code['36'] = ts('BRC: Restricted card');
	$code['38'] = ts('BRC: Allowable PIN tries exceeded');
  $code['41'] = ts('BRC: Lost card');
  $code['43'] = ts('BRC: Stolen card, pick-up');
  $code['51'] = ts('BRC: Not sufficient funds');
  $code['54'] = ts('BRC: Expired card');
  $code['55'] = ts('BRC: Incorrect personal identification number (PIN)');
	$code['56'] = ts('BRC: No card record');
  $code['57'] = ts('BRC: Transaction not permitted to cardholder');
  $code['61'] = ts('BRC: Exceeds withdrawal amount limit');
  $code['62'] = ts('BRC: Restricted card');
  $code['65'] = ts('BRC: Exceeds withdrawal frequency limit');
	$code['67'] = ts('BRC: decline Exceeds withdrawal frequency limit Hart capture (requires that card be picked up at the ATM)');
	$code['68'] = ts('BRC: Response received too late');
  $code['75'] = ts('BRC: Allowable number of PIN exceeded');
	$code['76'] = ts('BRC: Unable to Locate Previous Message');
  $code['80'] = ts('BRC: Invalid Date');
  $code['81'] = ts('BRC: Cryptographic Error Found in PIN or CVV');
  $code['82'] = ts('BRC: Incorrect CVV');
  $code['85'] = ts('BRC: No Reason To Decline a Request for AddressVerification');
	$code['87'] = ts('BRC: Bad track 2 (reserved for BASE24 use)');
	$code['88'] = ts('BRC: Reserved for private use');
	$code['89'] = ts('BRC: System error (reserved for BASE24 use)');
	$code['90'] = ts('BRC: Cutoff is in process (switch ending a day\'s business and starting the next. Transaction can be sent again in a few minutes)');
  $code['91'] = ts('BRC: Issuer or switch is inoperative');
	$code['92'] = ts('BRC: Financial institution or intermediate  network facility cannot be found for routing');
  $code['93'] = ts('BRC: Transaction cannot be Completed Violation of Law');
  $code['94'] = ts('BRC: Duplicate transmission');
  $code['96'] = ts('BRC: System malfunction');
  $code['99'] = ts('BRC: Line Busy');
  $code['IE'] = ts('BRC: ID Error');
  
  if(is_string($c)){
    if(strpos($c,"/")){
      $explode_c = explode("/", $c);
      $c = $explode_c[1];
    }
    return $code[$c];
  }
  else{
    return $code;
  }
}


// Main Response
function civicrm_neweb_prc($c = NULL){
  static $code = array();

  $code['0'] = ts('PRC: operation success');
  $code['1'] = ts('PRC: operation pending');
  $code['2'] = ts('PRC: undefined object');
  $code['3'] = ts('PRC: parameter not found');
  $code['4'] = ts('PRC: parameter too short');
  $code['5'] = ts('PRC: parameter too long');
  $code['6'] = ts('PRC: parameter format error');
  $code['7'] = ts('PRC: parameter value error');
  $code['8'] = ts('PRC: duplicate object');
  $code['9'] = ts('PRC: parameter mismatch');
  $code['10'] = ts('PRC: input error');
  $code['11'] = ts('PRC: verb not valid in present state');
  $code['12'] = ts('PRC: communication error');
  $code['13'] = ts('PRC: internal etill error');
  $code['14'] = ts('PRC: database error');
  $code['15'] = ts('PRC: cassette error');
  $code['17'] = ts('PRC: unsupported API version');
  $code['18'] = ts('PRC: obsolete API version');
  $code['19'] = ts('PRC: autoapprove failed');
  $code['20'] = ts('PRC: autodeposit failed');
  $code['21'] = ts('PRC: cassette not running');
  $code['22'] = ts('PRC: cassette not valid');
  $code['23'] = ts('PRC: unsupported in sysplex');
  $code['24'] = ts('PRC: parameter null value');
  $code['30'] = ts('PRC: XML error');
  $code['31'] = ts('PRC: corequisite parameter not found');
  $code['32'] = ts('PRC: invalid parameter combination');
  $code['33'] = ts('PRC: batch error');
  $code['34'] = ts('PRC: financial failure');
  $code['43'] = ts('PRC: block black BIN');
  $code['44'] = ts('PRC: block foreign');
  $code['50'] = ts('PRC: servlet init error');
  $code['51'] = ts('PRC: authentication error');
  $code['52'] = ts('PRC: authorization error');
  $code['53'] = ts('PRC: unhandled exception');
  $code['54'] = ts('PRC: duplicate parameter value not allowed');
  $code['55'] = ts('PRC: command not supported');
  $code['56'] = ts('PRC: crypto error');
  $code['57'] = ts('PRC: not active');
  $code['58'] = ts('PRC: parameter not allowed');
  $code['59'] = ts('PRC: delete error');
  $code['60'] = ts('PRC: websphere');
  $code['61'] = ts('PRC: supported in sysplex admin only');
  $code['62'] = ts('PRC: realm');
  $code['32768'] = ts('PRC: missing API version');
  $code['-1'] = ts('PRC: dispathcer error');
  
  if(is_string($c)){
    return $code[$c];
  }
  else{
    return $code;
  }
}
