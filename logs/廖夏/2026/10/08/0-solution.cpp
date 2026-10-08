#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 25;
string words[MAXN];
string head;
int n, ans;
int used[MAXN];
int link(string now, string wd){
	for (int i = 1; i < min(now.length(), wd.length()); i++){
		bool flag = true;
		for (int j = 0; j < i; j++){
			if (now[now.length()-i+j] != wd[j]) flag = false;
		}
		if (flag) return i;
	}
	return 0;
}
void dfs(string now, int len){
//	cout << now << " " << len << endl;
	ans = max(ans, len);
	for (int i = 1; i <= n; i++){
		if (used[i] < 2){
			int lk = link(now, words[i]);
			if (lk){
				used[i]++;
				dfs(words[i], len + words[i].length() - lk);
				used[i]--;
			}
		}
	}
}
int main(){
	cin >> n;
	for (int i = 1; i <= n; i++) cin >> words[i];
	cin >> head;
	dfs(" " + head, head.length());
	cout << ans;
	return 0;
}