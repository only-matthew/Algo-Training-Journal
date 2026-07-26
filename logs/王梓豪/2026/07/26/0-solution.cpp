#include <iostream>
#include <vector>
#include <iomanip>
#include <cmath>
#include <unordered_set>
#include <map>
#include <algorithm>
#include<unordered_map>
#include <cstdio>
#include <string>
#include <set>
#include <queue>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin>>n;
    n++;
    vector<vector<int>> a(n,vector<int>(n));
    for(int i=0;i<n;i++)
    {
        a[0][i]=1;
    }
    for(int i=1;i<n;i++)
    {
        for(int j=0;j<n-i;j++)
        {
            if(j>0)a[i][j]=a[i][j-1]+a[i-1][j+1];
            else if(j==0)a[i][j]=a[i-1][j+1];
        }
    }
    cout<<a[n-1][0]<<endl;
}