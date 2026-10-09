#include<iostream>
#include<algorithm>
#include<string>
#include<unordered_map>
using namespace std;
string wdsa[10], wdsb[10];
string A, B;
int ans = 100;
int n; 
unordered_map<string,int> best;
bool CanReplace(string s, string wd, int point){
	for (int i = 0; i < wd.length() ;i++){
		if (s[point+i] != wd[i]) return false;
		else if (i == wd.length()-1) return true;
	}		
	return true;
}
void dfs(string now, int cnt){
	if (cnt > 10 || cnt >= ans) return;
	if (best.count(now) && best[now] <= cnt) return;
	best[now] = cnt;
	if (now == B){
		ans = min(ans, cnt);
		return;
	}
	for (int i = 1; i <= n; i++){
		for (int j = 0; j < now.length(); j++){
			if (j + wdsa[i].length() > now.length()) break;
			if (CanReplace(now, wdsa[i], j)){
				string new_;
//				for (int k=0;k<now.length();k++){
//					if(k<j)new_+=now[k];
//					else if (k == j)new_ += wdsb[i];
//					else if (k > j + wdsa[i].length()) new_ += now[k];
//				}
				new_ = now.substr(0, j) + wdsb[i] + now.substr(j + wdsa[i].length());
				dfs(new_, cnt + 1);
			}
		}
	}
}
int main(){
	cin >> A >> B;
	int index = 1;
	while(cin >> wdsa[index] >> wdsb[index])index++;
	n = index-1;
	dfs(A, 0);
	if (ans != 100) cout << ans;
	else cout << "NO ANSWER!";
	return 0;
}